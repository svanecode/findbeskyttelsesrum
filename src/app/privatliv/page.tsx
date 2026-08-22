import type { Metadata } from "next";
import Link from "next/link";

import GlobalFooter from "@/components/GlobalFooter";
import { ui } from "@/components/ui-classes";
import { getPrivacyController } from "@/lib/privacy/controller";

export const metadata: Metadata = {
  title: "Privatliv og personoplysninger",
  description: "Sådan behandler Find Beskyttelsesrum adresse, placering, tekniske data, målinger og fejlrapporter.",
  alternates: { canonical: "/privatliv" },
};

const sectionClassName = "border-t border-white/10 py-6 sm:py-8";
const paragraphClassName = "mt-3 text-sm leading-6 text-gray-300";
const secondaryParagraphClassName = "mt-3 text-sm leading-6 text-gray-400";

export default function PrivacyPage() {
  const controller = getPrivacyController();

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <div className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="max-w-2xl space-y-4">
          <p className={ui.eyebrow}>Om tjenesten</p>
          <h1 className={ui.pageTitle}>Privatliv og personoplysninger</h1>
          <p className="text-lg leading-8 text-gray-300">
            Du behøver ikke en konto for at bruge Find Beskyttelsesrum. Denne side forklarer, hvilke oplysninger de
            enkelte funktioner behandler, hvorfor de behandles, hvem der modtager dem, og hvornår de slettes.
          </p>
          <p className="text-sm text-gray-500">Senest opdateret 22. august 2026.</p>
        </header>

        <div className="mt-10 border-b border-white/10">
          <section className={sectionClassName} aria-labelledby="controller-heading">
            <h2 id="controller-heading" className="text-lg font-semibold">Dataansvarlig og kontakt</h2>
            <p className={paragraphClassName}>
              Findbeskyttelsesrum.dk drives uafhængigt af {controller.name}, som er dataansvarlig for tjenestens egen
              behandling af personoplysninger. Tjenesten er ikke en myndighedstjeneste.
            </p>
            <dl className="mt-4 grid gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-gray-400">Dataansvarlig</dt>
              <dd>{controller.name}</dd>
              {controller.address ? (
                <>
                  <dt className="text-gray-400">Kontaktadresse</dt>
                  <dd>{controller.address}</dd>
                </>
              ) : null}
              <dt className="text-gray-400">Kontakt</dt>
              <dd>
                <Link className="underline underline-offset-4 hover:text-orange-200" href="/kontakt">
                  Privat kontakt- og svarportal
                </Link>
              </dd>
            </dl>
          </section>

          <section className={sectionClassName} aria-labelledby="location-heading">
            <h2 id="location-heading" className="text-lg font-semibold">Adresse- og placeringssøgning</h2>
            <p className={paragraphClassName}>
              Når du skriver en adresse, sendes søgeteksten fra din browser til den offentlige adressetjeneste DAWA.
              Vælger du din aktuelle placering, beder browseren først om din tilladelse. De valgte koordinater sendes
              derefter i en kortvarig POST-forespørgsel til tjenesten for at beregne afstande.
            </p>
            <p className={secondaryParagraphClassName}>
              Adressetekst og præcise koordinater lægges ikke i URL&apos;en eller i tjenestens produktmålinger. De gemmes
              lokalt i den aktuelle fanesession i højst 60 minutter. Hvis sessionslager er blokeret, bruges kun en
              midlertidig værdi i browserens hukommelse, som forsvinder ved genindlæsning.
            </p>
            <p className={secondaryParagraphClassName}>
              Formålet er at levere den søgning, du beder om. Retsgrundlaget er den dataansvarliges legitime interesse i
              at levere tjenestens kernefunktion, jf. databeskyttelsesforordningens artikel 6, stk. 1, litra f.
            </p>
          </section>

          <section className={sectionClassName} aria-labelledby="technical-heading">
            <h2 id="technical-heading" className="text-lg font-semibold">Hosting, sikkerhed og tekniske logs</h2>
            <p className={paragraphClassName}>
              Vercel leverer hjemmesiden og kan som led i drift, sikkerhed og misbrugsbeskyttelse behandle tekniske
              requestdata som IP-adresse, tidspunkt, browseroplysninger og den anmodede sti. Tjenesten gemmer ikke selv
              rå IP-adresser i sin database. Forbrugsgrænser bruger kun et envejs-hash, som ikke vises i administrationen.
            </p>
            <p className={secondaryParagraphClassName}>
              Klientfejl begrænses til fejlbesked, en kort stack, side-sti og faste kontekstfelter. Queryparametre,
              kendte lokationsfelter, koordinatpar og sandsynlige danske adresser redigeres før logning. Bruger-id og
              fuld browseridentifikation indgår ikke i fejlrapportformatet. Formålet og retsgrundlaget er sikker og stabil
              drift efter artikel 6, stk. 1, litra f.
            </p>
          </section>

          <section className={sectionClassName} aria-labelledby="analytics-heading">
            <h2 id="analytics-heading" className="text-lg font-semibold">Analyse og aggregerede målinger</h2>
            <p className={paragraphClassName}>
              Vercel Web Analytics og Speed Insights bruges til overordnet trafik- og ydelsesmåling. Før en sideadresse
              sendes til analyse, fjernes queryparametre og fragmenter. Vercel beskriver Web Analytics som cookie-fri og
              aggregeret, men modtager stadig den tekniske forbindelse, der er nødvendig for at levere målingen.
            </p>
            <p className={secondaryParagraphClassName}>
              Tjenestens egne produktmålinger er timevise tællere for en fast liste af handlinger. De indeholder ikke
              IP-adresse, bruger-id, adresse, koordinater, søgetekst eller fuld URL. Indlæsningstid afrundes til intervaller
              på 250 millisekunder, og tællerne slettes senest efter 90 dage. Betroede driftsheartbeats ligger i en separat,
              privat kanal og kan ikke oprettes af almindelige besøgende.
            </p>
            <p className={secondaryParagraphClassName}>
              Formålet er at opdage fejl og forbedre tjenesten. Retsgrundlaget er den dataansvarliges legitime interesse
              i stabilitet og produktforbedring efter artikel 6, stk. 1, litra f.
            </p>
          </section>

          <section className={sectionClassName} aria-labelledby="reports-heading">
            <h2 id="reports-heading" className="text-lg font-semibold">Fejlrapporter om registreringer</h2>
            <p className={paragraphClassName}>
              En rapport indeholder den valgte kategori og din beskrivelse. Der indsamles ikke navn eller e-mailadresse.
              Rapporten gemmes i en privat moderationskø med auditspor og ændrer aldrig offentlige data automatisk.
              Undlad CPR-nummer, helbredsoplysninger og andre følsomme oplysninger i friteksten.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-400">
              <li>Rapportens fritekst og moderatorens fritekstnote redigeres senest 24 måneder efter indsendelsen.</li>
              <li>Identificerende moderatoroplysninger i auditsporet redigeres efter 24 måneder.</li>
              <li>Det resterende strukturerede auditspor slettes efter 5 år.</li>
            </ul>
            <p className={secondaryParagraphClassName}>
              Formålet er at undersøge og dokumentere datakorrektioner. Retsgrundlaget er den dataansvarliges legitime
              interesse i korrekte og ansvarligt modererede oplysninger efter artikel 6, stk. 1, litra f.
            </p>
          </section>

          <section className={sectionClassName} aria-labelledby="contact-heading">
            <h2 id="contact-heading" className="text-lg font-semibold">Kontakt og anmodninger om persondata</h2>
            <p className={paragraphClassName}>
              Kontaktformularen gemmer den valgte kategori, emnet og din besked i en privat databasekø. Der indsamles
              ikke navn eller e-mailadresse. Ved indsendelsen får du et sagsnummer og en tilfældig adgangskode, som du
              skal gemme for at kunne læse svar og sende opfølgninger.
            </p>
            <p className={secondaryParagraphClassName}>
              Kun en SHA-256-kontrolværdi af adgangskoden gemmes. Den oprindelige adgangskode kan derfor ikke genskabes
              fra databasen. Sagsindhold slettes senest 24 måneder efter seneste aktivitet. Når en sag lukkes, forkortes
              fristen til højst 12 måneder efter lukningen. Auditsporet indeholder ikke beskedtekst eller adgangskode.
            </p>
            <p className={secondaryParagraphClassName}>
              Formålet er at besvare henvendelser og håndtere anmodninger om rettigheder. Behandling af almindelige
              henvendelser bygger på den dataansvarliges legitime interesse i at kunne drive og besvare spørgsmål om
              tjenesten, jf. artikel 6, stk. 1, litra f. Når en henvendelse vedrører en retlig GDPR-forpligtelse,
              behandles de nødvendige oplysninger for at overholde denne forpligtelse, jf. artikel 6, stk. 1, litra c.
            </p>
          </section>

          <section className={sectionClassName} aria-labelledby="admin-heading">
            <h2 id="admin-heading" className="text-lg font-semibold">Privat administration</h2>
            <p className={paragraphClassName}>
              Kun tilladte moderatorer har en konto. GitHub leverer OAuth-identiteten, og Supabase håndterer session og
              MFA. Der behandles stabilt GitHub-ID, login-navn, Supabase-bruger-ID, MFA-niveau og auditoplysninger om
              administrative handlinger. Oplysningerne bruges kun til adgangskontrol, sikkerhed og ansvarlighed.
            </p>
          </section>

          <section className={sectionClassName} aria-labelledby="recipients-heading">
            <h2 id="recipients-heading" className="text-lg font-semibold">Modtagere og eksterne tjenester</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-300">
              <li>Vercel: hosting, sikkerhedslogs, Web Analytics og Speed Insights.</li>
              <li>Supabase: database, private kontakt- og moderationskøer, driftsdata og moderatorlogin/MFA.</li>
              <li>GitHub: kun moderatorlogin, automatiske driftskørsler og kodehosting.</li>
              <li>DAWA/Dataforsyningen: adresseforslag fra din browser.</li>
              <li>OpenStreetMap: kortfelter fra din browser, når et kort aktiveres.</li>
              <li>En uafhængig uptime-tjeneste: kontrollerer kun det offentlige sundhedsendpoint.</li>
            </ul>
            <p className={secondaryParagraphClassName}>
              Nogle leverandører er etableret uden for EU/EØS eller bruger underleverandører dér. Overførsel kan derfor
              ske på grundlag af en tilstrækkelighedsafgørelse eller EU&apos;s standardkontraktbestemmelser, afhængigt af den
              enkelte leverandørs aktuelle opsætning. Der sendes ikke adresse, koordinater eller rapporttekst til den
              eksterne uptime-kontrol.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a className="underline underline-offset-4 hover:text-orange-200" href="https://vercel.com/legal/privacy-notice" rel="noreferrer">Vercels privatlivsinformation</a>
              <a className="underline underline-offset-4 hover:text-orange-200" href="https://supabase.com/privacy" rel="noreferrer">Supabases privatlivsinformation</a>
              <a className="underline underline-offset-4 hover:text-orange-200" href="https://www.openstreetmap.org/privacy" rel="noreferrer">OpenStreetMaps privatlivsinformation</a>
            </div>
          </section>

          <section className={sectionClassName} aria-labelledby="rights-heading">
            <h2 id="rights-heading" className="text-lg font-semibold">Dine rettigheder</h2>
            <p className={paragraphClassName}>
              Du kan efter omstændighederne anmode om indsigt, berigtigelse, sletning eller begrænsning og gøre indsigelse
              mod behandling, der bygger på legitime interesser. Du kan også klage til Datatilsynet. Tjenesten bruger ikke
              automatiske afgørelser eller profilering med retsvirkning for dig.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/kontakt" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline underline-offset-4 hover:bg-white/5">
                Kontakt den dataansvarlige
              </Link>
              <a href="https://www.datatilsynet.dk/borger/klage/saadan-klager-du" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline underline-offset-4 hover:bg-white/5" rel="noreferrer">
                Sådan klager du til Datatilsynet
              </a>
            </div>
          </section>

          <section className={sectionClassName} aria-labelledby="storage-heading">
            <h2 id="storage-heading" className="text-lg font-semibold">Netforbindelse og lokal lagring</h2>
            <p className={paragraphClassName}>
              Tjenesten er en almindelig hjemmeside og kræver netforbindelse. Den tilbyder ikke en offlinekopi af
              registreringerne eller kortet, så ældre data ikke kan forveksles med den seneste dataimport.
            </p>
          </section>

          <section className={sectionClassName}>
            <h2 className="text-lg font-semibold">Læs mere</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/om-data" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline underline-offset-4 hover:bg-white/5">
                Datagrundlag og forbehold
              </Link>
              <Link href="/" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-white underline underline-offset-4 hover:bg-white/5">
                Til forsiden
              </Link>
            </div>
          </section>
        </div>
      </div>

      <GlobalFooter />
    </main>
  );
}
