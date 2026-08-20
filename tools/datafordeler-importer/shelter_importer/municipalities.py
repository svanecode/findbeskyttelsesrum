"""Canonical Danish municipality metadata keyed by BBR municipality code."""

from __future__ import annotations

from .models import Municipality

# Names are kept local so import identity does not depend on a second remote service.
_RAW = """
0101|kobenhavn|København
0147|frederiksberg|Frederiksberg
0151|ballerup|Ballerup
0153|brondby|Brøndby
0155|dragor|Dragør
0157|gentofte|Gentofte
0159|gladsaxe|Gladsaxe
0161|glostrup|Glostrup
0163|herlev|Herlev
0165|albertslund|Albertslund
0167|hvidovre|Hvidovre
0169|hoje-taastrup|Høje Taastrup
0173|lyngby-taarbek|Lyngby-Taarbæk
0175|rodovre|Rødovre
0183|ishoj|Ishøj
0185|taarnby|Tårnby
0187|vallensbek|Vallensbæk
0190|fureso|Furesø
0201|allerod|Allerød
0210|fredensborg|Fredensborg
0217|helsingor|Helsingør
0219|hillerod|Hillerød
0223|horsholm|Hørsholm
0230|rudersdal|Rudersdal
0240|egedal|Egedal
0250|frederikssund|Frederikssund
0253|greve|Greve
0259|koge|Køge
0260|halsnes|Halsnæs
0265|roskilde|Roskilde
0269|solrod|Solrød
0270|gribskov|Gribskov
0306|odsherred|Odsherred
0316|holbek|Holbæk
0320|faxe|Faxe
0326|kalundborg|Kalundborg
0329|ringsted|Ringsted
0330|slagelse|Slagelse
0336|stevns|Stevns
0340|soro|Sorø
0350|lejre|Lejre
0360|lolland|Lolland
0370|nestved|Næstved
0376|guldborgsund|Guldborgsund
0390|vordingborg|Vordingborg
0400|bornholm|Bornholm
0410|middelfart|Middelfart
0420|assens|Assens
0430|faaborg-midtfyn|Faaborg-Midtfyn
0440|kerteminde|Kerteminde
0450|nyborg|Nyborg
0461|odense|Odense
0479|svendborg|Svendborg
0480|nordfyns|Nordfyns
0482|langeland|Langeland
0492|ero|Ærø
0510|haderslev|Haderslev
0530|billund|Billund
0540|sonderborg|Sønderborg
0550|tonder|Tønder
0561|esbjerg|Esbjerg
0563|fano|Fanø
0573|varde|Varde
0575|vejen|Vejen
0580|aabenraa|Aabenraa
0607|fredericia|Fredericia
0615|horsens|Horsens
0621|kolding|Kolding
0630|vejle|Vejle
0657|herning|Herning
0661|holstebro|Holstebro
0665|lemvig|Lemvig
0671|struer|Struer
0706|syddjurs|Syddjurs
0707|norddjurs|Norddjurs
0710|favrskov|Favrskov
0727|odder|Odder
0730|randers|Randers
0740|silkeborg|Silkeborg
0741|samso|Samsø
0746|skanderborg|Skanderborg
0751|aarhus|Aarhus
0756|ikast-brande|Ikast-Brande
0760|ringkobing-skjern|Ringkøbing-Skjern
0766|hedensted|Hedensted
0773|morso|Morsø
0779|skive|Skive
0787|thisted|Thisted
0791|viborg|Viborg
0810|bronderslev|Brønderslev
0813|frederikshavn|Frederikshavn
0820|vesthimmerlands|Vesthimmerlands
0825|leso|Læsø
0840|rebild|Rebild
0846|mariagerfjord|Mariagerfjord
0849|jammerbugt|Jammerbugt
0851|aalborg|Aalborg
0860|hjorring|Hjørring
""".strip()

MUNICIPALITIES = {
    code: Municipality(code=code, slug=slug, name=name)
    for code, slug, name in (line.split("|", 2) for line in _RAW.splitlines())
}


def municipality_for(code: str) -> Municipality:
    return MUNICIPALITIES.get(
        code,
        Municipality(code=code, slug=f"kommune-{code}", name=f"Kommune {code}"),
    )
