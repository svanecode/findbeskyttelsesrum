export type MunicipalityMetadata = {
  code: string;
  slug: string;
  name: string;
  regionName: string | null;
};

const municipalityMetadataByCode: Record<string, MunicipalityMetadata> = {
  "0101": { code: "0101", slug: "kobenhavn", name: "København", regionName: null },
  "0147": { code: "0147", slug: "frederiksberg", name: "Frederiksberg", regionName: null },
  "0151": { code: "0151", slug: "ballerup", name: "Ballerup", regionName: null },
  "0153": { code: "0153", slug: "brondby", name: "Brøndby", regionName: null },
  "0155": { code: "0155", slug: "dragor", name: "Dragør", regionName: null },
  "0157": { code: "0157", slug: "gentofte", name: "Gentofte", regionName: null },
  "0159": { code: "0159", slug: "gladsaxe", name: "Gladsaxe", regionName: null },
  "0161": { code: "0161", slug: "glostrup", name: "Glostrup", regionName: null },
  "0163": { code: "0163", slug: "herlev", name: "Herlev", regionName: null },
  "0165": { code: "0165", slug: "albertslund", name: "Albertslund", regionName: null },
  "0167": { code: "0167", slug: "hvidovre", name: "Hvidovre", regionName: null },
  "0169": { code: "0169", slug: "hoje-taastrup", name: "Høje Taastrup", regionName: null },
  "0173": { code: "0173", slug: "lyngby-taarbek", name: "Lyngby-Taarbæk", regionName: null },
  "0175": { code: "0175", slug: "rodovre", name: "Rødovre", regionName: null },
  "0183": { code: "0183", slug: "ishoj", name: "Ishøj", regionName: null },
  "0185": { code: "0185", slug: "taarnby", name: "Tårnby", regionName: null },
  "0187": { code: "0187", slug: "vallensbek", name: "Vallensbæk", regionName: null },
  "0190": { code: "0190", slug: "fureso", name: "Furesø", regionName: null },
  "0201": { code: "0201", slug: "allerod", name: "Allerød", regionName: null },
  "0210": { code: "0210", slug: "fredensborg", name: "Fredensborg", regionName: null },
  "0217": { code: "0217", slug: "helsingor", name: "Helsingør", regionName: null },
  "0219": { code: "0219", slug: "hillerod", name: "Hillerød", regionName: null },
  "0223": { code: "0223", slug: "horsholm", name: "Hørsholm", regionName: null },
  "0230": { code: "0230", slug: "rudersdal", name: "Rudersdal", regionName: null },
  "0240": { code: "0240", slug: "egedal", name: "Egedal", regionName: null },
  "0250": { code: "0250", slug: "frederikssund", name: "Frederikssund", regionName: null },
  "0253": { code: "0253", slug: "greve", name: "Greve", regionName: null },
  "0259": { code: "0259", slug: "koge", name: "Køge", regionName: null },
  "0260": { code: "0260", slug: "halsnes", name: "Halsnæs", regionName: null },
  "0265": { code: "0265", slug: "roskilde", name: "Roskilde", regionName: null },
  "0269": { code: "0269", slug: "solrod", name: "Solrød", regionName: null },
  "0270": { code: "0270", slug: "gribskov", name: "Gribskov", regionName: null },
  "0306": { code: "0306", slug: "odsherred", name: "Odsherred", regionName: null },
  "0316": { code: "0316", slug: "holbek", name: "Holbæk", regionName: null },
  "0320": { code: "0320", slug: "faxe", name: "Faxe", regionName: null },
  "0326": { code: "0326", slug: "kalundborg", name: "Kalundborg", regionName: null },
  "0329": { code: "0329", slug: "ringsted", name: "Ringsted", regionName: null },
  "0330": { code: "0330", slug: "slagelse", name: "Slagelse", regionName: null },
  "0336": { code: "0336", slug: "stevns", name: "Stevns", regionName: null },
  "0340": { code: "0340", slug: "soro", name: "Sorø", regionName: null },
  "0350": { code: "0350", slug: "lejre", name: "Lejre", regionName: null },
  "0360": { code: "0360", slug: "lolland", name: "Lolland", regionName: null },
  "0370": { code: "0370", slug: "nestved", name: "Næstved", regionName: null },
  "0376": { code: "0376", slug: "guldborgsund", name: "Guldborgsund", regionName: null },
  "0390": { code: "0390", slug: "vordingborg", name: "Vordingborg", regionName: null },
  "0400": { code: "0400", slug: "bornholms", name: "Bornholm", regionName: null },
  "0410": { code: "0410", slug: "middelfart", name: "Middelfart", regionName: null },
  "0420": { code: "0420", slug: "assens", name: "Assens", regionName: null },
  "0430": { code: "0430", slug: "faaborg-midtfyn", name: "Faaborg-Midtfyn", regionName: null },
  "0440": { code: "0440", slug: "kerteminde", name: "Kerteminde", regionName: null },
  "0450": { code: "0450", slug: "nyborg", name: "Nyborg", regionName: null },
  "0461": { code: "0461", slug: "odense", name: "Odense", regionName: null },
  "0479": { code: "0479", slug: "svendborg", name: "Svendborg", regionName: null },
  "0480": { code: "0480", slug: "nordfyns", name: "Nordfyns", regionName: null },
  "0482": { code: "0482", slug: "langeland", name: "Langeland", regionName: null },
  "0492": { code: "0492", slug: "ero", name: "Ærø", regionName: null },
  "0510": { code: "0510", slug: "haderslev", name: "Haderslev", regionName: null },
  "0530": { code: "0530", slug: "billund", name: "Billund", regionName: null },
  "0540": { code: "0540", slug: "sonderborg", name: "Sønderborg", regionName: null },
  "0550": { code: "0550", slug: "tonder", name: "Tønder", regionName: null },
  "0561": { code: "0561", slug: "esbjerg", name: "Esbjerg", regionName: null },
  "0563": { code: "0563", slug: "fano", name: "Fanø", regionName: null },
  "0573": { code: "0573", slug: "varde", name: "Varde", regionName: null },
  "0575": { code: "0575", slug: "vejen", name: "Vejen", regionName: null },
  "0580": { code: "0580", slug: "aabenraa", name: "Aabenraa", regionName: null },
  "0607": { code: "0607", slug: "fredericia", name: "Fredericia", regionName: null },
  "0615": { code: "0615", slug: "horsens", name: "Horsens", regionName: null },
  "0621": { code: "0621", slug: "kolding", name: "Kolding", regionName: null },
  "0630": { code: "0630", slug: "vejle", name: "Vejle", regionName: null },
  "0657": { code: "0657", slug: "herning", name: "Herning", regionName: null },
  "0661": { code: "0661", slug: "holstebro", name: "Holstebro", regionName: null },
  "0665": { code: "0665", slug: "lemvig", name: "Lemvig", regionName: null },
  "0671": { code: "0671", slug: "struer", name: "Struer", regionName: null },
  "0706": { code: "0706", slug: "syddjurs", name: "Syddjurs", regionName: null },
  "0707": { code: "0707", slug: "norddjurs", name: "Norddjurs", regionName: null },
  "0710": { code: "0710", slug: "favrskov", name: "Favrskov", regionName: null },
  "0727": { code: "0727", slug: "odder", name: "Odder", regionName: null },
  "0730": { code: "0730", slug: "randers", name: "Randers", regionName: null },
  "0740": { code: "0740", slug: "silkeborg", name: "Silkeborg", regionName: null },
  "0741": { code: "0741", slug: "samso", name: "Samsø", regionName: null },
  "0746": { code: "0746", slug: "skanderborg", name: "Skanderborg", regionName: null },
  "0751": { code: "0751", slug: "aarhus", name: "Aarhus", regionName: null },
  "0756": { code: "0756", slug: "ikast-brande", name: "Ikast-Brande", regionName: null },
  "0760": { code: "0760", slug: "ringkobing-skjern", name: "Ringkøbing-Skjern", regionName: null },
  "0766": { code: "0766", slug: "hedensted", name: "Hedensted", regionName: null },
  "0773": { code: "0773", slug: "morso", name: "Morsø", regionName: null },
  "0779": { code: "0779", slug: "skive", name: "Skive", regionName: null },
  "0787": { code: "0787", slug: "thisted", name: "Thisted", regionName: null },
  "0791": { code: "0791", slug: "viborg", name: "Viborg", regionName: null },
  "0810": { code: "0810", slug: "bronderslev", name: "Brønderslev", regionName: null },
  "0813": { code: "0813", slug: "frederikshavn", name: "Frederikshavn", regionName: null },
  "0820": { code: "0820", slug: "vesthimmerlands", name: "Vesthimmerlands", regionName: null },
  "0825": { code: "0825", slug: "leso", name: "Læsø", regionName: null },
  "0840": { code: "0840", slug: "rebild", name: "Rebild", regionName: null },
  "0846": { code: "0846", slug: "mariagerfjord", name: "Mariagerfjord", regionName: null },
  "0849": { code: "0849", slug: "jammerbugt", name: "Jammerbugt", regionName: null },
  "0851": { code: "0851", slug: "aalborg", name: "Aalborg", regionName: null },
  "0860": { code: "0860", slug: "hjorring", name: "Hjørring", regionName: null },
};

const municipalityCodeBySlug = Object.fromEntries(
  Object.entries(municipalityMetadataByCode).map(([code, metadata]) => [metadata.slug, code]),
) as Record<string, string>;

const fallbackSlugPattern = /^kommune-(\d{4})$/;
const fallbackNamePattern = /^Municipality (\d{4})$/;

function getFallbackCode(value: string | null | undefined, pattern: RegExp) {
  const match = value?.match(pattern);

  return match?.[1] ?? null;
}

export function getMunicipalityMetadataByCode(code: string) {
  return municipalityMetadataByCode[code] ?? null;
}

export function getMunicipalityCodeBySlug(slug: string) {
  return municipalityCodeBySlug[slug] ?? getFallbackCode(slug, fallbackSlugPattern);
}

export function getMunicipalitySlugCandidates(slug: string) {
  const code = getMunicipalityCodeBySlug(slug);
  const candidates = new Set([slug]);

  if (code) {
    candidates.add(`kommune-${code}`);
    const metadata = getMunicipalityMetadataByCode(code);

    if (metadata) {
      candidates.add(metadata.slug);
    }
  }

  return Array.from(candidates);
}

export function normalizeMunicipalityDisplay(input: {
  id: string;
  slug: string | null | undefined;
  name: string | null | undefined;
}) {
  const code =
    getMunicipalityCodeBySlug(input.slug ?? "") ??
    getFallbackCode(input.name, fallbackNamePattern);

  if (!code) {
    return {
      id: input.id,
      slug: input.slug ?? "unknown",
      name: input.name ?? "Unknown municipality",
    };
  }

  const metadata = getMunicipalityMetadataByCode(code);

  if (!metadata) {
    return {
      id: input.id,
      slug: input.slug ?? `kommune-${code}`,
      name: input.name ?? `Municipality ${code}`,
    };
  }

  return {
    id: input.id,
    slug: metadata.slug,
    name: metadata.name,
  };
}
