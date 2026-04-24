import GlobalFooter from '@/components/GlobalFooter'
import AddressSearchDAWA from '@/components/AddressSearchDAWA'

export const revalidate = 600

export default async function Home() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-4 sm:p-6 lg:p-8 flex flex-col justify-center items-center relative">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>
      
      <div className="max-w-2xl mx-auto flex-1 w-full px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col justify-center">
        <div className="text-center mb-8 sm:mb-12 lg:mb-16">
          <h1 className="text-heading-lg sm:text-heading-xl mb-4 sm:mb-6 lg:mb-8 text-white">
            Find nærmeste beskyttelsesrum
          </h1>
          <p className="text-body-lg sm:text-xl text-[#E5E7EB] mb-8 sm:mb-10 lg:mb-12 max-w-lg mx-auto">
            Søg på din adresse eller brug din placering. Vælg et resultat for at få rutevejledning.
          </p>
        </div>
        
        <div className="glass-effect p-6 sm:p-8 lg:p-10 rounded-2xl shadow-2xl backdrop-blur-md bg-white/10 border border-white/10 relative overflow-visible card-interactive">
          <div className="space-y-8 sm:space-y-6 lg:space-y-8 relative z-20">
            <div suppressHydrationWarning className="relative z-20">
              <AddressSearchDAWA key="dawa-v2" />
            </div>

            <p className="text-center text-xs sm:text-sm text-gray-300/90">
              Bygger på offentlige BBR- og DAR-data. Følg altid myndighedernes anvisninger.
            </p>
            
          </div>
        </div>
      </div>

      <GlobalFooter />
    </main>
  )
}
