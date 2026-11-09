'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from './button';
import { Dialog } from './dialog';
import { Toast } from './toast';
type Detector = new (options: { formats: string[] }) => {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
export function PickupCamera({
  onScan,
  disabled = false,
}: {
  onScan: (code: string) => void;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState(false),
    [open, setOpen] = useState(false),
    [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    requestVersion = useRef(0),
    close = () => {
      requestVersion.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setOpen(false);
    };
  useEffect(() => {
    setAvailable(
      !!(window as unknown as { BarcodeDetector?: Detector }).BarcodeDetector &&
        !!navigator.mediaDevices?.getUserMedia,
    );
    return () => {
      requestVersion.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let running = false,
      active = true;
    const Class = (window as unknown as { BarcodeDetector?: Detector })
      .BarcodeDetector;
    if (!Class) return;
    let detector: InstanceType<Detector>;
    try {
      detector = new Class({ formats: ['qr_code'] });
    } catch {
      setError('This browser cannot scan QR codes. Enter the code instead.');
      return;
    }
    const timer = setInterval(() => {
      if (running || !video.current || video.current.readyState < 2) return;
      running = true;
      void detector
        .detect(video.current)
        .then((rows) => {
          if (active && rows[0]?.rawValue) {
            requestVersion.current++;
            onScan(rows[0].rawValue);
            stream.current?.getTracks().forEach((t) => t.stop());
            stream.current = null;
            setOpen(false);
          }
        })
        .catch(() => {
          if (active)
            setError(
              'The camera could not read this pass. Use a scanner or enter the code instead.',
            );
        })
        .finally(() => {
          running = false;
        });
    }, 300);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [open, onScan]);
  if (!available) return <p>Use a QR scanner or enter the 8-character code.</p>;
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={async () => {
          const version = ++requestVersion.current;
          setError('');
          setOpen(true);
          try {
            const media = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' } },
            });
            if (version !== requestVersion.current) {
              media.getTracks().forEach((t) => t.stop());
              return;
            }
            stream.current = media;
            if (video.current) {
              video.current.srcObject = media;
              await video.current.play();
            }
          } catch {
            if (version !== requestVersion.current) return;
            stream.current?.getTracks().forEach((t) => t.stop());
            stream.current = null;
            setError(
              'Camera unavailable. Allow camera access, or use the code instead.',
            );
          }
        }}
      >
        <Camera size={18} aria-hidden="true" />
        Scan with camera
      </Button>
      <Dialog open={open} title="Scan buyer check-in pass" onClose={close}>
        <video
          className="agn-visit-camera"
          ref={video}
          muted
          playsInline
          aria-label="Check-in QR camera"
        />
        {error && (
          <Toast tone="error" emphasis onClose={() => setError('')}>
            {error}
          </Toast>
        )}
        <p>The camera is used only to read the pass. Video is not uploaded.</p>
      </Dialog>
    </>
  );
}
