import type { BeneficiaryEntry } from '../types';

interface Props {
  beneficiaries: BeneficiaryEntry[];
  onChange: (b: BeneficiaryEntry[]) => void;
}

export function BeneficiaryEditor({ beneficiaries, onChange }: Props) {
  const total = beneficiaries.reduce((s, b) => s + b.bps, 0);
  const valid = total === 10000;

  const update = (i: number, field: keyof BeneficiaryEntry, value: string) => {
    const next = beneficiaries.map((b, idx) =>
      idx === i
        ? { ...b, [field]: field === 'bps' ? Math.round(parseFloat(value) * 100) : value }
        : b,
    );
    onChange(next);
  };

  const add = () => onChange([...beneficiaries, { address: '', bps: 0 }]);
  const remove = (i: number) => onChange(beneficiaries.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-3">
      {beneficiaries.map((b, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1">
            <input
              placeholder="Stellar address (G…)"
              value={b.address}
              onChange={(e) => update(i, 'address', e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="w-24">
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              placeholder="%"
              value={b.bps / 100 || ''}
              onChange={(e) => update(i, 'bps', e.target.value)}
            />
          </div>
          {beneficiaries.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-gray-500 hover:text-red-400 mt-2 text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          className="text-sm text-brand-red hover:text-red-400"
        >
          + Add beneficiary
        </button>
        <span className={`text-sm font-mono ${valid ? 'text-green-400' : 'text-yellow-400'}`}>
          {(total / 100).toFixed(2)}% {valid ? '✓' : `(need 100%)`}
        </span>
      </div>
    </div>
  );
}
