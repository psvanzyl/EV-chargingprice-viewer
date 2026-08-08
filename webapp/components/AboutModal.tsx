"use client";

import { X, PlayCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onStartTutorial?: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <div className="text-gray-700 space-y-1">{children}</div>
    </section>
  );
}

export default function AboutModal({ isOpen, onClose, onStartTutorial }: Props) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">Over Laadpalenviewer — uitleg &amp; methodologie</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {onStartTutorial && (
            <button
              onClick={() => {
                onClose();
                onStartTutorial();
              }}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100"
            >
              <PlayCircle className="h-4 w-4" /> Start de rondleiding
            </button>
          )}

          <Section title="Wat toont deze app?">
            <p>
              Alle publiek toegankelijke laadpunten in Nederland in twee lagen — <strong>personenauto</strong> en
              <strong> logistiek/vracht</strong> — plus een analyse-laag per gemeente (vraag, plaatsing, bezetting,
              netimpact).
            </p>
          </Section>

          <Section title="Databronnen">
            <ul className="space-y-1">
              <li>
                <strong>NDW DOT-NL (OCPI 2.2.1)</strong> — laadlocaties, connectoren, tarieven en status.
                Open data via opendata.ndw.nu.
              </li>
              <li>
                <strong>NDW uurlijkse momentopname</strong> — wij downloaden de OCPI-export elk uur en leiden er
                bezetting/status-historie uit af.
              </li>
              <li>
                <strong>CBS Kerncijfers wijken en buurten (85984NED)</strong> — inwoners, huishoudens, inkomen,
                stedelijkheid, autobezit. Licentie CC-BY 4.0 (© CBS).
              </li>
              <li>
                <strong>PDOK CBS Gebiedsindelingen</strong> — gemeente- en provinciegrenzen. <strong>PDOK Locatieserver</strong> — adres zoeken.
              </li>
              <li>
                <strong>Open Charge Map</strong> + handmatig samengestelde truck-hubs (Milence, WattHub) — extra
                vrachtlocaties.
              </li>
            </ul>
          </Section>

          <Section title="Personenauto vs. logistiek/vracht">
            <p>
              Een laadpunt is <strong>dedicated truck</strong> bij een expliciet signaal: een truck-exploitant
              (Milence/WattHub…), “truck” of “vrachtwagen” in de naam, de MCS/megawatt-standaard, of een logistiek
              depot met ≥ 150 kW DC. Locaties die alléén op vermogen kwalificeren (DC ≥ 350 kW, zoals 400 kW-lanen
              van personenauto-netwerken) heten <strong>truck-capable</strong> en krijgen een lichtere kleur — niet
              elke locatie daarvan is fysiek toegankelijk voor een trekker-oplegger. Megawatt-locaties (≥ 1 MW of
              MCS) krijgen een aparte kleur. Connectorvermogen wordt waar nodig afgeleid uit spanning × stroomsterkte.
            </p>
          </Section>

          <Section title="Status &amp; gebruik">
            <p>
              Markerkleuren tonen de OCPI-status (beschikbaar/bezet/niet beschikbaar/onbekend) uit de laatste
              uurlijkse snapshot. <strong>Bezetting</strong> = aandeel connectoren (EVSE&apos;s) met status “laden”. De
              grafiek “Gebruik over de tijd” bouwt deze bezetting per uur op (24u/7d/30d/1j).
            </p>
          </Section>

          <Section title="Berekeningen (analyse-laag)">
            <ul className="space-y-1">
              <li>
                <strong>Verwachte vraag (peer-model)</strong> — een random-forest die het verwachte aantal
                laadpunten voorspelt uit demografie (inwoners, huishoudens, auto&apos;s, inkomen, stedelijkheid,
                adresdichtheid). Out-of-fold gevalideerd.
              </li>
              <li>
                <strong>Tekort/overschot</strong> = werkelijk − verwacht. <strong>Plaatsingsprioriteit (0-100)</strong>{" "}
                combineert relatief + absoluut tekort en bezetting.
              </li>
              <li>
                <strong>Belasting nu (live)</strong> = (EVSE&apos;s die nú laden, uit de snapshot) × ~11 kW.
              </li>
              <li>
                <strong>Potentiële piek (planning)</strong> = (alle EVSE&apos;s) × ~11 kW × 30% gelijktijdigheid.
              </li>
              <li>
                <strong>Congestie-index</strong> = relatieve percentielrang van de piekbelasting per inwoner.
                <strong> Netimpact-scenario</strong> herschaalt de piek met EV-groei en slim-laden.
              </li>
            </ul>
          </Section>

          <Section title="Belangrijke nuances / beperkingen">
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>
                <strong>Vermogen wordt aangenomen</strong> (~11 kW/laadpunt): NDW publiceert <em>max_electric_power</em>
                voor ±90% van de connectoren niet. Absolute kW zijn dus schattingen.
              </li>
              <li>
                <strong>Congestie is gemodelleerd</strong> — er is geen DSO-capaciteit ingelezen (de Capaciteitskaart
                is alleen een viewer). De index is relatief, geen knelpuntvoorspelling.
              </li>
              <li>
                <strong>EV-aantallen</strong> zijn nog niet per gemeente meegenomen (RDW heeft geen locatie; CBS-EV per
                regio volgt). Vraag is nu op autobezit/demografie gebaseerd.
              </li>
              <li>
                Analyse is op <strong>gemeente-niveau</strong> (buurt/PC4 volgt). “Laadpunten” = OCPI-locaties; één
                locatie kan meerdere sockets (EVSE&apos;s) hebben.
              </li>
              <li>NDW-dekking kan per gemeente verschillen (sommige CPO&apos;s ontbreken), wat aanbod kan onderschatten.</li>
            </ul>
          </Section>

          <p className="text-xs text-gray-400 pt-2 border-t">
            Attributie: data © CBS (CC-BY 4.0), PDOK (CC0), NDW (open data), Open Charge Map. Voor operationeel
            gebruik altijd de bron raadplegen.
          </p>
        </div>
      </div>
    </div>
  );
}
