// Help centre content. Kept apart from the page design so it is easy to edit
// now and can move into the planned admin content editor later. Figures that
// come from business rules (fees, pickup days, limits) are computed from the
// shared rules the checkout uses, so the help text cannot drift from them.
import {
  DEFAULT_FEE_RULES,
  DEFAULT_WITHDRAWAL_RULES,
  FIXED_PRICE_TAX_BPS,
  calculateBidCancellationFee,
  calculateFixedPrice,
  calculateInvoiceLine,
} from '@auction-ng/shared/fees';
import { formatNaira } from '@auction-ng/shared/money';
import { SOFT_CLOSE_MS } from '@auction-ng/shared/auction-rules';
import {
  COLLECTION_POLICY,
  PICKUP_FREE_WORKING_DAYS,
  PURCHASE_RESERVATION_MS,
} from '@auction-ng/shared';

export type HelpBlock =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; items: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; rows: [string, string][]; total?: [string, string] };

export type HelpQuestion = {
  id: string;
  question: string;
  answer: HelpBlock[];
};
export type HelpTopic = {
  id: string;
  title: string;
  summary: string;
  icon:
    | 'account'
    | 'wallet'
    | 'bidding'
    | 'buy-now'
    | 'fees'
    | 'pickup'
    | 'cancel'
    | 'returns'
    | 'delivery'
    | 'items';
  questions: HelpQuestion[];
};

// Owner decisions (2026-11-10): storage after the free days, support hours.
const STORAGE_PER_DAY_NAIRA = '₦1,000';
const SUPPORT_HOURS = '9am to 5pm, Monday to Saturday (WAT)';

const percent = (bps: number) => `${(bps / 100).toLocaleString('en-NG')}%`;
const naira = (kobo: number) => formatNaira(kobo);
const fees = DEFAULT_FEE_RULES;
const example = calculateInvoiceLine(2000000, fees);
const buyNow = calculateFixedPrice(3000000, FIXED_PRICE_TAX_BPS);
const cancellationFee = calculateBidCancellationFee(2000000, fees.premiumBps);
const softCloseMinutes = SOFT_CLOSE_MS / 60000;
const reservationMinutes = PURCHASE_RESERVATION_MS / 60000;

export const helpTopics: HelpTopic[] = [
  {
    id: 'account',
    title: 'Account and security',
    summary: 'Sign up, sign in, codes, 2FA and passwords',
    icon: 'account',
    questions: [
      {
        id: 'create-account',
        question: 'How do I create an account?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Tap Create account at the top of any page.',
              'Enter your full name, email address and a password, then tap Create account.',
              'We email you a 6-digit code. Enter it to verify your email. Your account is created once the code is confirmed.',
            ],
          },
          {
            kind: 'text',
            text: 'You need a verified email address to bid or buy. Use an email you can always reach, because sign-in codes are sent there.',
          },
        ],
      },
      {
        id: 'six-digit-code',
        question: 'What is the 6-digit code and why do I need it?',
        answer: [
          {
            kind: 'text',
            text: 'Each time you sign in on a new device, and when you verify your email or reset your password, we email you a 6-digit code. It proves the email belongs to you, so someone with only your password cannot get in.',
          },
          {
            kind: 'list',
            items: [
              'Use the latest code we sent. Older codes stop working.',
              'Codes expire after a short time. If yours has expired, request a new one.',
              'Check your spam or promotions folder if it has not arrived within a few minutes.',
              'Never share a code with anyone, including people claiming to be LotVanta staff.',
            ],
          },
        ],
      },
      {
        id: 'sign-in',
        question: 'How do I sign in?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Tap Sign in and enter your email address and password.',
              'Enter the 6-digit code we email you.',
              'If you have turned on authenticator 2FA, enter the code from your authenticator app as well.',
            ],
          },
        ],
      },
      {
        id: 'two-factor',
        question: 'How does authenticator 2FA work?',
        answer: [
          {
            kind: 'text',
            text: 'Two-factor authentication (2FA) adds a code from an authenticator app, such as Google Authenticator, on top of your password and email code. It is optional but recommended.',
          },
          {
            kind: 'steps',
            items: [
              'Go to your Account page, find Two-factor authentication and choose to turn it on.',
              'Confirm with your password and the email code we send.',
              'Scan the QR code with your authenticator app and enter the 6-digit code it shows.',
              'Save your recovery codes somewhere safe. Each one works once if you lose your phone.',
            ],
          },
          {
            kind: 'text',
            text: 'With 2FA on, we also ask for your authenticator code when you sign in, reset your password, withdraw money or change your payout bank account. You can turn it off from the same settings page.',
          },
        ],
      },
      {
        id: 'forgot-password',
        question: 'I forgot my password. What should I do?',
        answer: [
          {
            kind: 'steps',
            items: [
              'On the sign-in page, tap Forgot password.',
              'Enter your email address and we send you a recovery code.',
              'Enter the code, then choose a new password. If 2FA is on, enter your authenticator or recovery code too.',
              'Sign in again with your new password.',
            ],
          },
          {
            kind: 'text',
            text: 'For your safety, resetting your password signs you out on every device.',
          },
        ],
      },
      {
        id: 'stay-safe',
        question: 'How do I keep my account safe?',
        answer: [
          {
            kind: 'list',
            items: [
              'LotVanta will never ask for your password, sign-in code, authenticator code or pickup QR code.',
              'Only sign in on lotvanta.ng. Check the address before entering your details.',
              'Use a password you do not use anywhere else, and turn on authenticator 2FA.',
              'If you notice anything unusual, change your password and contact us.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'wallet',
    title: 'Wallet and payments',
    summary: 'Add money, balances and withdrawals',
    icon: 'wallet',
    questions: [
      {
        id: 'fund-wallet',
        question: 'How do I add money to my wallet?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Go to Wallet and enter the amount you want to add.',
              'Choose to pay by card or by bank transfer.',
              'Tap Show fee and wallet credit to see the processing charge and exactly how much reaches your wallet.',
              'Accept and pay securely through Paystack. Your wallet updates once the payment is confirmed.',
            ],
          },
          {
            kind: 'text',
            text: 'Card payments: we accept cards supported by Paystack. Bank transfer: Paystack shows a temporary account number. Transfer the exact amount shown before it expires.',
          },
        ],
      },
      {
        id: 'processing-charges',
        question: 'Are there charges for adding money?',
        answer: [
          {
            kind: 'text',
            text: 'Paystack charges a small processing fee for card and transfer payments. You always see the fee and the amount your wallet will receive before you pay, so there are no surprises.',
          },
        ],
      },
      {
        id: 'available-balance',
        question:
          'What is the difference between my available and reserved balance?',
        answer: [
          {
            kind: 'text',
            text: 'When you bid, we reserve enough of your wallet to cover your bid plus the auction fees. That money is reserved, not spent. Your available balance is what is free for new bids, Buy Now or withdrawal.',
          },
          {
            kind: 'list',
            items: [
              'If someone outbids you, the reserved amount goes straight back to your available balance.',
              'If you win, the reserved amount pays for the item and fees.',
            ],
          },
        ],
      },
      {
        id: 'withdraw',
        question: 'How do I withdraw money to my bank account?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Go to Wallet, then Withdraw funds.',
              'Add your payout bank account if you have not already: your bank, account number, the name on your BVN and your BVN. This makes sure money only goes to an account in your name.',
              'Enter the amount and confirm with your password, the email code and your authenticator code if 2FA is on.',
            ],
          },
          {
            kind: 'list',
            items: [
              `The minimum withdrawal is ${naira(DEFAULT_WITHDRAWAL_RULES.minimumKobo)}.`,
              `You can withdraw up to ${naira(DEFAULT_WITHDRAWAL_RULES.dailyLimitKobo)} a day.`,
              'A small transfer fee is shown before you confirm.',
              'Changing your payout bank account needs the same checks, for your protection.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'bidding',
    title: 'Bidding',
    summary: 'How to bid, outbids and closing times',
    icon: 'bidding',
    questions: [
      {
        id: 'how-to-bid',
        question: 'How do I bid?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Make sure you are signed in, your email is verified and your wallet has enough available balance.',
              'Open an item and check its photos, condition and pickup location.',
              'Enter your bid and tap Bid now.',
              'Review the total, including fees, then tap Place bid to confirm.',
            ],
          },
          {
            kind: 'text',
            text: 'Any amount above the current price is accepted. Before anyone has bid, you can bid the starting price or more.',
          },
        ],
      },
      {
        id: 'bid-types',
        question:
          'What is the difference between a full bid and an automatic limit?',
        answer: [
          {
            kind: 'list',
            items: [
              'Bid full amount (the default): your full bid becomes the displayed price if you lead.',
              'Automatic limit: you set a private maximum and we bid for you, only as much as needed to keep you in the lead, up to your limit. Nobody else sees your limit.',
            ],
          },
          {
            kind: 'text',
            text: 'If two automatic limits are equal, the earlier one wins. You can raise your own limit, but you cannot lower an accepted bid or limit.',
          },
        ],
      },
      {
        id: 'outbid',
        question: 'What happens if someone outbids me?',
        answer: [
          {
            kind: 'text',
            text: 'We let you know, and the money reserved for your bid goes back to your available balance straight away. You can bid again if you want the item.',
          },
        ],
      },
      {
        id: 'closing-time',
        question: 'Why did the closing time change?',
        answer: [
          {
            kind: 'text',
            text: `If a bid is accepted in the last ${softCloseMinutes} minutes, the auction is extended to ${softCloseMinutes} minutes from that bid. This gives everyone a fair chance to respond. It can happen more than once.`,
          },
        ],
      },
      {
        id: 'pre-bids',
        question: 'Can I bid on upcoming auctions?',
        answer: [
          {
            kind: 'text',
            text: 'Yes. On Upcoming Deals you can set a private pre-bid limit before bidding opens. It is placed for you when the auction starts.',
          },
        ],
      },
    ],
  },
  {
    id: 'buy-now',
    title: 'Buy Now (Instant Win)',
    summary: 'Buy at a fixed price without waiting',
    icon: 'buy-now',
    questions: [
      {
        id: 'what-is-buy-now',
        question: 'What is Buy Now?',
        answer: [
          {
            kind: 'text',
            text: 'Some items have a fixed Buy Now price. Buy at that price to win the item straight away, without waiting for the auction to end. Find them all on the Instant Win page.',
          },
        ],
      },
      {
        id: 'buy-now-price',
        question: 'What do I pay with Buy Now?',
        answer: [
          {
            kind: 'text',
            text: `You pay the Buy Now price plus ${percent(FIXED_PRICE_TAX_BPS)} tax. There is no auction service charge or lot fee. If you pay by card or transfer, the processing charge is shown before you pay.`,
          },
          {
            kind: 'table',
            rows: [
              ['Buy Now price', naira(buyNow.priceKobo)],
              [`Tax (${percent(FIXED_PRICE_TAX_BPS)})`, naira(buyNow.taxKobo)],
            ],
            total: ['You pay (from wallet)', naira(buyNow.totalKobo)],
          },
        ],
      },
      {
        id: 'buy-now-steps',
        question: 'How do I use Buy Now?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Open the item and tap Buy Now.',
              'Choose to pay from your wallet, by card or by bank transfer.',
              'Review the total and confirm.',
            ],
          },
          {
            kind: 'text',
            text: `The item is held for you for up to ${reservationMinutes} minutes while you pay. Once payment is confirmed, the auction closes and you get your invoice and pickup pass.`,
          },
        ],
      },
    ],
  },
  {
    id: 'fees',
    title: 'Fees and total cost',
    summary: 'What you pay when you win',
    icon: 'fees',
    questions: [
      {
        id: 'auction-fees',
        question: 'What fees are added when I win an auction?',
        answer: [
          {
            kind: 'list',
            items: [
              `A service charge of ${percent(fees.premiumBps)} of your winning bid.`,
              `A lot fee of ${naira(fees.lotFeeKobo)} per item.`,
              `VAT of ${percent(fees.vatBps)} on the service charge and lot fee.`,
            ],
          },
          {
            kind: 'text',
            text: 'These are our standard fees. The exact fees for each item are shown on the item page and before you confirm your bid.',
          },
        ],
      },
      {
        id: 'fee-example',
        question: 'Can you show me an example?',
        answer: [
          {
            kind: 'text',
            text: `If you win an item with a bid of ${naira(example.hammerKobo)}:`,
          },
          {
            kind: 'table',
            rows: [
              ['Winning bid', naira(example.hammerKobo)],
              [
                `Service charge (${percent(fees.premiumBps)})`,
                naira(example.premiumKobo),
              ],
              ['Lot fee', naira(example.lotFeeKobo)],
              [`VAT (${percent(fees.vatBps)} on fees)`, naira(example.vatKobo)],
            ],
            total: ['Total you pay', naira(example.totalKobo)],
          },
        ],
      },
    ],
  },
  {
    id: 'pickup',
    title: 'Winning and pickup',
    summary: 'Invoices, pickup passes and collection',
    icon: 'pickup',
    questions: [
      {
        id: 'after-you-win',
        question: 'What happens when I win?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Payment is taken from the amount reserved in your wallet.',
              'You receive your invoice and a private QR pickup pass in your account.',
              'We tell you when your item is ready to collect.',
            ],
          },
        ],
      },
      {
        id: 'collect',
        question: 'How do I collect my item?',
        answer: [
          {
            kind: 'steps',
            items: [
              'Go to the pickup location shown on your invoice.',
              'Show your QR pickup pass (from your account) to our staff.',
              'Inspect your item before you leave.',
            ],
          },
          {
            kind: 'text',
            text: 'Keep your pickup pass private. Anyone with your QR code could try to collect your item.',
          },
        ],
      },
      {
        id: 'collection-time',
        question: 'How long do I have to collect?',
        answer: [
          {
            kind: 'text',
            text: `Collection is free for ${PICKUP_FREE_WORKING_DAYS} working days from when your item is ready. After that, a storage charge of ${STORAGE_PER_DAY_NAIRA} per day applies until you collect. The amount due is shown in your account.`,
          },
        ],
      },
    ],
  },
  {
    id: 'cancel',
    title: 'Bid cancellation',
    summary: 'Asking to cancel a bid',
    icon: 'cancel',
    questions: [
      {
        id: 'request-cancellation',
        question: 'Can I cancel a bid?',
        answer: [
          {
            kind: 'text',
            text: 'Bids are binding, so please bid carefully. If you need to withdraw a bid before the auction closes, you can request a cancellation from the item page. Our team reviews each request.',
          },
          {
            kind: 'steps',
            items: [
              'Open the item and choose to request a bid cancellation.',
              'Tell us why and send the request. Sending a request is free.',
              'If staff approve it, the cancellation fee is charged and your bid is cancelled.',
            ],
          },
        ],
      },
      {
        id: 'cancellation-fee',
        question: 'How much does a cancellation cost?',
        answer: [
          {
            kind: 'text',
            text: `The fee is the service charge rate (${percent(fees.premiumBps)}) of the current bid price. For example, on a ${naira(2000000)} bid it is ${naira(cancellationFee)}. You are only charged if the cancellation is approved.`,
          },
          {
            kind: 'text',
            text: 'After a cancellation you cannot bid on that item again.',
          },
        ],
      },
    ],
  },
  {
    id: 'returns',
    title: 'Returns and refunds',
    summary: 'Inspection, returns and refunds',
    icon: 'returns',
    questions: [
      {
        id: 'inspect',
        question: 'Should I check my item before leaving?',
        answer: [{ kind: 'text', text: COLLECTION_POLICY.inspection }],
      },
      {
        id: 'returns-policy',
        question: 'Can I return an item?',
        answer: [
          { kind: 'text', text: COLLECTION_POLICY.returns },
          { kind: 'text', text: COLLECTION_POLICY.rights },
        ],
      },
      {
        id: 'refunds',
        question: 'Do you give refunds?',
        answer: [
          {
            kind: 'text',
            text: 'We do not offer refunds as standard. If you have a problem with a payment or an item, contact us with your invoice reference. If, after we investigate, a refund is approved, it is paid back to your LotVanta wallet.',
          },
        ],
      },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    summary: 'Getting your item home',
    icon: 'delivery',
    questions: [
      {
        id: 'delivery-available',
        question: 'Do you deliver?',
        answer: [
          {
            kind: 'text',
            text: 'Delivery is not available for now. All items are collected from the pickup location shown on the item and your invoice. Please check the location before you bid.',
          },
        ],
      },
    ],
  },
  {
    id: 'condition-grades',
    title: 'Items and condition',
    summary: 'Condition grades, photos and notes',
    icon: 'items',
    questions: [
      {
        id: 'condition-grades-explained',
        question: 'What do the condition grades mean?',
        answer: [
          {
            kind: 'list',
            items: [
              'New: unused, in original condition.',
              'Like new: used very little, with no obvious signs of wear.',
              'Open box: the packaging has been opened. The item may have been returned or displayed.',
              'Damaged: has visible damage or faults described in the notes.',
              'Untested: we have not checked whether it works.',
            ],
          },
          {
            kind: 'text',
            text: 'A grade is a guide. Always read the item description, look at every photo and check what is included before you bid.',
          },
        ],
      },
      {
        id: 'item-questions',
        question: 'I have a question about an item. Who do I ask?',
        answer: [
          {
            kind: 'text',
            text: 'Contact us before bidding with the item ID shown on the item page. We will check what we can for you.',
          },
        ],
      },
    ],
  },
];

export const helpSupport = {
  hours: SUPPORT_HOURS,
  prepare:
    'Have your item ID or invoice reference ready. Never share your password, sign-in code or pickup QR code.',
};

// Plain text of an answer, for search engines' FAQ markup.
export function helpBlockText(block: HelpBlock): string {
  if (block.kind === 'text') return block.text;
  if (block.kind === 'table')
    return [...block.rows, ...(block.total ? [block.total] : [])]
      .map(([label, value]) => `${label}: ${value}.`)
      .join(' ');
  return block.items.join(' ');
}
