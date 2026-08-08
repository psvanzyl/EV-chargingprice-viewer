"use client";

import { useState } from "react";
import { X, Copy, Check } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  municipality: string;
  municipalityName: string;
}

export default function ShareModal({ isOpen, onClose, municipality, municipalityName }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!isOpen) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const slug = municipality === "nederland" ? "alle-gemeenten" : municipality;
  const shareUrl = `${origin}/?gemeente=${slug}`;
  const embedCode = `<iframe src="${origin}/embed?gemeente=${slug}" width="100%" height="600" style="border:0" title="Laadpalenviewer ${municipalityName}"></iframe>`;

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Delen — {municipalityName}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 text-sm">
          <Field label="Link" value={shareUrl} copied={copied === "url"} onCopy={() => copy(shareUrl, "url")} />
          <Field label="Embed-code" value={embedCode} copied={copied === "embed"} onCopy={() => copy(embedCode, "embed")} multiline />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  copied,
  onCopy,
  multiline,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        {multiline ? (
          <textarea
            readOnly
            value={value}
            rows={3}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs font-mono resize-none"
          />
        ) : (
          <input readOnly value={value} className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs" />
        )}
        <button
          onClick={onCopy}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-1 text-xs"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
