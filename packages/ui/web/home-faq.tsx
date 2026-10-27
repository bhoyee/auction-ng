import { ChevronDown } from 'lucide-react';

const questions = [
  {
    question: 'What is Auction NG and how does it work?',
    answer:
      'Auction NG is a liquidation-auction marketplace. Browse a lot, check its photos and condition notes, fund your wallet and place a bid. If you win, follow the payment and pickup instructions for that lot.',
  },
  {
    question: 'Do I need money in my wallet to bid?',
    answer:
      'Yes. You need enough available funds to cover your bid and its fees. You can top up by card or bank transfer. Review the funding fee and the amount your wallet will receive before paying.',
  },
  {
    question: 'What happens if someone outbids me?',
    answer:
      'When you are outbid, the funds reserved for that lot are released back to your available wallet balance. You can choose to bid again or use those funds for another auction.',
  },
  {
    question: 'Why does an auction closing time sometimes change?',
    answer:
      'A bid accepted in the final two minutes extends the auction to two minutes from that bid. This gives other buyers time to respond. Always follow the live countdown on the lot.',
  },
  {
    question: 'Where do I collect an item I have won?',
    answer:
      'Check the pickup location on the lot before bidding. After winning and payment, follow your pickup instructions and bring your pickup pass when collecting from the warehouse.',
  },
] as const;

export function HomeFaq() {
  return (
    <section
      className="agn-container agn-home-faq"
      aria-labelledby="home-faq-title"
    >
      <h2 id="home-faq-title">Frequently asked questions</h2>
      <div className="agn-home-faq-list">
        {questions.map(({ question, answer }) => (
          <details key={question} name="home-faq">
            <summary>
              {question}
              <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
