import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface GroupedShelter {
  id: string
  kommunekode: string | null
  shelter_capacity: number | null
  address: string | null
  postnummer: string | null
  vejnavn: string | null
  husnummer: string | null
  location: {
    type: string
    coordinates: number[]
  } | null
  anvendelse: string | null
  total_capacity: number
  shelter_count: number
  anvendelseskoder?: {
    kode: string
    beskrivelse: string
    skal_med: boolean
  }
}

async function generateNationalShelters() {
  console.log('Starting to generate national shelters JSON...')

  try {
    // First get all anvendelseskoder that should be included
    const { data: anvendelseskoderData, error: anvendelseskoderError } = await supabase
      .from('anvendelseskoder')
      .select('kode')
      .eq('skal_med', true)

    if (anvendelseskoderError) {
      throw anvendelseskoderError
    }

    const validAnvendelseskoder = anvendelseskoderData?.map((ak: { kode: string }) => ak.kode) || []

    // Get the total count
    const { count, error: countError } = await supabase
      .from('sheltersv2')
      .select('*', { count: 'exact', head: true })
      .gte('shelter_capacity', 40)
      .not('location', 'is', null)
      .in('anvendelse', validAnvendelseskoder)

    if (countError) {
      throw countError
    }

    console.log('Total shelters to fetch:', count)

    // Fetch shelters in batches of 1000
    const allShelters = []
    const batchSize = 1000
    const totalBatches = Math.ceil((count || 0) / batchSize)

    for (let i = 0; i < totalBatches; i++) {
      console.log(`Fetching batch ${i + 1}/${totalBatches}`)
      
      const { data, error } = await supabase
        .from('sheltersv2')
        .select(`
          id,
          created_at,
          bygning_id,
          kommunekode,
          shelter_capacity,
          address,
          postnummer,
          vejnavn,
          husnummer,
          location,
          anvendelse,
          deleted,
          last_checked,
          anvendelseskoder (
            kode,
            beskrivelse,
            skal_med,
            kategori,
            created_at,
            updated_at
          )
        `)
        .gte('shelter_capacity', 40)
        .not('location', 'is', null)
        .in('anvendelse', validAnvendelseskoder)
        .range(i * batchSize, (i + 1) * batchSize - 1)

      if (error) {
        throw error
      }

      if (data) {
        allShelters.push(...data)
      }
    }

    console.log('Total shelters fetched:', allShelters.length)

    // Group shelters by address and calculate total capacity
    const groupedShelters = allShelters.reduce((acc: { [key: string]: GroupedShelter }, shelter) => {
      const address = shelter.address || `${shelter.vejnavn} ${shelter.husnummer}`
      if (!acc[address]) {
        acc[address] = {
          ...shelter,
          total_capacity: Number(shelter.shelter_capacity) || 0,
          shelter_count: 1,
          anvendelseskoder: shelter.anvendelseskoder?.[0]
        }
      } else {
        acc[address].total_capacity += Number(shelter.shelter_capacity) || 0
        acc[address].shelter_count += 1
      }
      return acc
    }, {})

    const finalData = {
      lastUpdated: new Date().toISOString(),
      shelters: Object.values(groupedShelters)
    }

    // Write to file
    const outputPath = join(process.cwd(), 'public', 'data', 'national-shelters.json')
    fs.mkdirSync(dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(finalData, null, 2))

    console.log(`Successfully generated national shelters JSON at ${outputPath}`)
    console.log(`Total grouped shelters: ${Object.keys(groupedShelters).length}`)
  } catch (error) {
    console.error('Error generating national shelters:', error)
    process.exit(1)
  }
}

generateNationalShelters() 