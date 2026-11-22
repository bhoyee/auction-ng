#!/usr/bin/env bash
# Only Cloudflare may open web connections (80/443) on the public interface,
# so attackers cannot skip Cloudflare by hitting the server IP directly.
# Docker-published ports bypass ufw, so the rules sit in DOCKER-USER (Docker
# NAT) and INPUT (docker-proxy, e.g. IPv6 without Docker IPv6 networking).
# Usage: cloudflare-firewall.sh [on|off]   (off removes the restriction)
# Ranges: https://www.cloudflare.com/ips/ (2026-11). Keep in sync with the
# trusted_proxies list in infra/Caddyfile.
set -euo pipefail

MODE=${1:-on}
IFACE=${IFACE:-$(ip route show default | awk '{print $5; exit}')}
CHAIN=CLOUDFLARE-ONLY
V4=(173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22
  141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20
  197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22)
V6=(2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32
  2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32)
# New inbound web connections only; replies to the server's own outgoing
# HTTPS calls (Paystack, R2, email) are not affected.
JUMPS=("-p tcp -m conntrack --ctstate NEW --ctorigdstport 80"
  "-p tcp -m conntrack --ctstate NEW --ctorigdstport 443"
  "-p udp -m conntrack --ctstate NEW --ctorigdstport 443")

apply() {
  local ipt=$1
  shift
  "$ipt" -N DOCKER-USER 2>/dev/null || true
  for parent in DOCKER-USER INPUT; do
    for jump in "${JUMPS[@]}"; do
      # shellcheck disable=SC2086 # jump holds several iptables words
      while "$ipt" -D "$parent" -i "$IFACE" $jump -j "$CHAIN" 2>/dev/null; do :; done
    done
  done
  "$ipt" -F "$CHAIN" 2>/dev/null && "$ipt" -X "$CHAIN"
  [ "$MODE" = off ] && return
  "$ipt" -N "$CHAIN"
  for range in "$@"; do "$ipt" -A "$CHAIN" -s "$range" -j RETURN; done
  "$ipt" -A "$CHAIN" -j DROP
  for parent in DOCKER-USER INPUT; do
    for jump in "${JUMPS[@]}"; do
      # shellcheck disable=SC2086
      "$ipt" -I "$parent" -i "$IFACE" $jump -j "$CHAIN"
    done
  done
}

case "$MODE" in on | off) ;; *) echo "Usage: $0 [on|off]" >&2; exit 2 ;; esac
[ -n "$IFACE" ] || { echo "No default network interface found" >&2; exit 1; }
apply iptables "${V4[@]}"
apply ip6tables "${V6[@]}"
echo "Cloudflare-only web firewall $MODE on $IFACE"
