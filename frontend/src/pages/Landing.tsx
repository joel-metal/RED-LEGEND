import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';

const STEPS = [
  { icon: '🔒', title: 'Lock', desc: 'Deposit XLM into your vault and name a beneficiary.' },
  { icon: '✅', title: 'Check In', desc: 'Periodically prove you\'re alive — takes 5 seconds.' },
  { icon: '📤', title: 'Release', desc: 'If you stop checking in, funds go to your beneficiary automatically.' },
];

export default function Landing() {
  return (
    <Layout>
      {/* Hero */}
      <section className="text-center py-16 space-y-6">
        <div className="inline-block bg-brand-red/10 border border-brand-red/30 text-brand-red text-xs px-3 py-1 rounded-full uppercase tracking-widest">
          Dead Man's Switch · Stellar Testnet
        </div>
        <h1 className="text-4xl sm:text-6xl font-bold leading-tight">
          Your crypto,<br />
          <span className="text-brand-red">automatically inherited.</span>
        </h1>
        <p className="text-gray-400 max-w-xl mx-auto text-lg">
          RED-LEGEND is a trustless vault that releases your funds to a loved one
          if you stop checking in — no lawyers, no seed phrases, no middlemen.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/auth"
            className="bg-brand-red hover:bg-brand-darkred text-white px-6 py-3 rounded-xl font-semibold text-lg transition-colors"
          >
            Create Your Vault
          </Link>
          <a
            href="https://github.com/joel-metal/RED-LEGEND"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-brand-border hover:border-gray-400 text-gray-300 px-6 py-3 rounded-xl font-semibold text-lg transition-colors"
          >
            View on GitHub
          </a>
        </div>
      </section>

      {/* 3-step diagram */}
      <section className="py-12">
        <h2 className="text-center text-gray-500 text-sm uppercase tracking-widest mb-8">How it works</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <div key={i} className="bg-brand-surface border border-brand-border rounded-xl p-6 text-center space-y-3">
              <div className="text-4xl">{step.icon}</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-brand-red font-mono text-sm">{i + 1}.</span>
                <h3 className="font-semibold text-lg">{step.title}</h3>
              </div>
              <p className="text-gray-400 text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
        {/* Arrow connectors (desktop) */}
        <div className="hidden sm:flex justify-center gap-0 -mt-[calc(50%+1rem)] pointer-events-none" />
      </section>

      {/* Why section */}
      <section className="py-12 border-t border-brand-border">
        <div className="grid sm:grid-cols-3 gap-6 text-center">
          {[
            { label: 'Trustless', desc: 'Smart contract enforces the rules — no executor needed.' },
            { label: 'No seed phrases', desc: 'Authenticate with your fingerprint or face via Passkey.' },
            { label: 'Transparent', desc: 'All vault state and transfers are publicly verifiable on-chain.' },
          ].map((f) => (
            <div key={f.label} className="space-y-2">
              <div className="text-brand-red font-semibold">{f.label}</div>
              <p className="text-gray-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}
