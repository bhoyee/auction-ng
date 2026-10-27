export const policyContent = {
  terms: {
    title: 'Terms of Use',
    introduction:
      'How the Auction NG marketplace works, and what to check before you bid.',
    sections: [
      {
        title: 'About Auction NG',
        text: 'Auction NG is a liquidation-auction marketplace for Nigerian buyers. The current demo uses sample lots, representative photos and test funds. Demo listings do not offer real goods for sale.',
      },
      {
        title: 'Your account',
        text: 'Provide accurate account information and keep your email account and sign-in codes private. Email verification and an eligible account are required to bid. Do not share your account or attempt to interfere with other buyers or the auction system.',
      },
      {
        title: 'Before you bid',
        text: 'Read the lot description, photos, condition notes, fees and pickup information. New, like new, open box, damaged and untested describe different conditions; check the actual lot rather than assuming it is unused or complete.',
      },
      {
        title: 'Bidding and closing',
        text: 'Direct bidding is the default. Automatic bidding uses a private limit only when you choose it. Your available wallet funds must cover your commitment and the estimated fees. A bid accepted in the last two minutes extends the auction to two minutes from that bid. The server determines the auction result.',
      },
      {
        title: 'Wallet funding and fees',
        text: 'Review the provider fee and net wallet credit before funding by card or bank transfer. Review the auction total before confirming a bid. Funds may be reserved while you lead; an outbid reservation is released. A confirmed win is settled by the server. These pages do not replace the specific totals shown during checkout or bidding.',
      },
      {
        title: 'Collecting your item',
        text: 'Check the warehouse location before bidding. After a confirmed paid win, use the collection instructions and your private pickup pass. Production collection deadlines, storage charges and uncollected-item rules must be confirmed and published before real auctions launch.',
      },
      {
        title: 'Returns, refunds and disputes',
        text: 'Contact support with your lot or invoice reference if there is a problem. Do not send passwords, verification codes or full card details. The final returns policy, dispute process and any cancellation rules must be confirmed before paid production use; this draft does not introduce a no-refunds rule or waive statutory rights.',
      },
      {
        title: 'Availability and changes',
        text: 'A connection problem can interrupt bidding or live updates. Reconnect and check the current lot state before acting. Material changes to the final terms should be clearly published with an updated date. Operator details and the final governing-law and dispute clauses remain subject to review.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    introduction:
      'What information the current Auction NG application handles and why.',
    sections: [
      {
        title: 'Who handles your information',
        text: 'Auction NG is the marketplace brand. The registered operator’s identity and business address are awaiting confirmation. Use the contact address below for privacy questions while this draft is under review.',
      },
      {
        title: 'Information we handle',
        text: 'The application handles account and contact details, email verification and session records, device identifiers, bidding activity, watchlists, wallet and payment references, invoices and pickup records. Information supplied for payment verification or support is handled for that purpose. Technical connection and security records may also be processed.',
      },
      {
        title: 'Why information is used',
        text: 'Information supports account access, fraud prevention, live auction updates, wallet accounting, payment reconciliation, invoices, collection and support. The production policy must map each purpose to its appropriate lawful basis and identify any additional processing before it begins.',
      },
      {
        title: 'Payments and service providers',
        text: 'Card and transfer checkout uses Paystack. The marketplace uses payment references and verification responses to reconcile funds; you should never send full card details or verification codes to support. Hosting, email delivery and storage providers support the service. The final provider list and processing locations must be confirmed before production publication.',
      },
      {
        title: 'Cookies and browser storage',
        text: 'Necessary tools support sign-in, device identity, payment recovery and acknowledgement of the cookie notice. No advertising or analytics trackers are currently enabled in this application. The Cookie Policy describes the storage items found in this build.',
      },
      {
        title: 'Security and retention',
        text: 'Sign-in uses email verification codes and the web refresh credential is stored in an HttpOnly cookie. Staff access is restricted by role. No security measure is an absolute guarantee. Retention periods, deletion procedures, backup retention and any international-processing arrangements require confirmation in the final policy.',
      },
      {
        title: 'Your privacy requests',
        text: 'You can contact us about access, correction, deletion, restriction, objection or withdrawal of consent where applicable. Some transaction or security records may need to be retained to meet legal duties or resolve disputes. The final policy must explain the request process and applicable response periods. You may also contact the Nigeria Data Protection Commission at ndpc.gov.ng.',
      },
      {
        title: 'Policy updates',
        text: 'The date on this page identifies the current draft. New tracking, purposes or providers must be assessed and reflected in the policy and any required consent controls before being introduced.',
      },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    introduction:
      'A clear guide to cookies and browser storage used by this application.',
    sections: [
      {
        title: 'What these tools do',
        text: 'Cookies are small values stored by your browser and sent to the relevant website. Local storage stays in that browser until it is removed; session storage is tied to the browser tab. Auction NG uses necessary storage for account access and transaction continuity.',
      },
      {
        title: 'Sign-in cookie',
        text: 'auction_refresh is set by the API when you sign in on the web. It supports session refresh, uses HttpOnly and SameSite=Strict, and is scoped to /auth. Its configured maximum age is 30 days; it is rotated during refresh and cleared on logout. Secure is enabled outside local development.',
      },
      {
        title: 'Device and payment storage',
        text: 'auction-ng-device is a local-storage device identifier used for account session security. It remains until removed or replaced. auction-ng-pending-payment is session storage used to recover a funding flow; the application clears it after completion, and the browser normally clears session storage when its tab session ends.',
      },
      {
        title: 'Remembering this notice',
        text: 'auction-ng-cookie-notice records the notice version and acknowledgement time in local storage. The notice is shown again after 180 days or if the saved value is missing, invalid or out of date. This acknowledgement is not consent to advertising or analytics.',
      },
      {
        title: 'Optional tracking',
        text: 'No optional advertising or analytics trackers are enabled in the current application. There are no optional categories to turn on in Cookie settings. If optional tracking is introduced, it must have an appropriate choice and remain off until any required consent is given.',
      },
      {
        title: 'Managing storage',
        text: 'Open Cookie settings in the footer to review this information at any time. You can delete or block site storage using your browser controls; doing so may sign you out, interrupt payment recovery or cause this notice to reappear. Blocking optional tracking does not require removing necessary sign-in storage.',
      },
      {
        title: 'Other websites',
        text: 'Paystack checkout, app stores and other linked websites have their own cookies and privacy notices. Opening those services is separate from acknowledging Auction NG’s necessary-storage notice.',
      },
    ],
  },
} as const;
