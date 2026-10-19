#!/usr/bin/env python3
"""One-off helper that appended the second batch of funds to catalog/funds.json.

Kept in the repo as a record of what was added and as a template. It is idempotent:
entries whose id already exists are skipped. Edit catalog/funds.json directly for changes.
"""
import json
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "catalog" / "funds.json"

VERIFY = "Confirm the details on the provider's page before relying on them."


def fund(id, name, short, asset, cat, region, mix, eq, wrap, kind, index, tickers, ticker, extends, purpose, overview, goal, note="", tags=()):
    d = {"type": "fund", "ticker": ticker}
    if extends:
        d["extends"] = list(extends)
    e = {
        "id": id, "name": name, "short": short, "kind": kind, "assetClass": asset, "category": cat,
        "region": region, "mix": mix, "equityPct": eq, "wrapper": wrap, "index": index,
        "tickers": tickers, "data": d, "purpose": purpose, "overview": overview, "goal": goal,
    }
    if note:
        e["note"] = note
    if tags:
        e["tags"] = list(tags)
    return e


def blend(id, name, short, eq, weights, index, purpose, overview, note=""):
    return {
        "id": id, "name": name, "short": short, "kind": "benchmark", "assetClass": "reference",
        "category": "Benchmark", "region": "us", "mix": "mixed" if eq not in (0, 100) else "other",
        "equityPct": eq, "wrapper": "reference", "index": index, "tickers": {},
        "data": {"type": "blend", "weights": weights, "rebalance": "monthly"},
        "purpose": purpose, "overview": overview,
        "goal": "Show what this mix would have done.",
        "note": note or "Hypothetical. Not an investable fund. Ignores trading costs and taxes.",
    }


XL_NOTE = ("Vanguard's sector ETF started in 2004. Earlier history uses the matching Select Sector SPDR ETF ({xl}), scaled to match "
           "on the Vanguard fund's first date. The two follow slightly different indexes, so treat the older part as a close stand-in. ")

NEW = []

# ---------------------------------------------------------------- sector funds
sectors = [
    ("VGT", "Technology", "Technology sector", "VITAX", "XLK", "MSCI US IMI Information Technology 25/50",
     "Concentrated bet on US technology: software, semiconductors, hardware and IT services.",
     "Holds US technology companies, weighted by size, so a few giants (chip makers, software and device makers) dominate. It is the main place AI and software enthusiasm shows up in index funds.",
     "Capture the return of the US technology sector.", ("ai-software",)),
    ("VHT", "Health care", "Health care sector", "VHCIX", "XLV", "MSCI US IMI Health Care 25/50",
     "Exposure to drug makers, device makers, insurers and hospital operators. Demand for health care changes little in recessions.",
     "Holds US health care companies weighted by size: large drug makers, medical device makers, managed-care insurers and biotechnology.",
     "Capture the return of the US health care sector.", ("defensive",)),
    ("VFH", "Financials", "Financials sector", "VFAIX", "XLF", "MSCI US IMI Financials 25/50",
     "Exposure to banks, insurers, asset managers and payment companies. Tends to swing with the credit cycle.",
     "Holds US banks, insurance companies, brokers and other financial firms, weighted by size.",
     "Capture the return of the US financial sector.", ()),
    ("VDE", "Energy", "Energy sector", "VENAX", "XLE", "MSCI US IMI Energy 25/50",
     "Oil, gas and energy-services companies. Often rises when inflation does and falls hard when oil prices collapse.",
     "Holds US oil and gas producers, refiners and energy-equipment companies, weighted by size.",
     "Capture the return of the US energy sector.", ()),
    ("VIS", "Industrials", "Industrials sector", "VINAX", "XLI", "MSCI US IMI Industrials 25/50",
     "Aerospace, machinery, transportation and construction companies. Moves with the business cycle.",
     "Holds US industrial companies, weighted by size: aerospace and defense, machinery, airlines, railroads and building products.",
     "Capture the return of the US industrial sector.", ()),
    ("VCR", "Consumer discretionary", "Consumer discretionary sector", "VCDAX", "XLY", "MSCI US IMI Consumer Discretionary 25/50",
     "Companies selling things people can put off buying: autos, travel, restaurants, online retail. Sensitive to recessions.",
     "Holds US consumer-facing companies in cyclical businesses, weighted by size. A small number of very large online and auto retailers dominate.",
     "Capture the return of the US consumer discretionary sector.", ()),
    ("VDC", "Consumer staples", "Consumer staples sector", "VCSAX", "XLP", "MSCI US IMI Consumer Staples 25/50",
     "Everyday necessities: groceries, household goods, food, drinks and tobacco. Demand holds up when the economy falls, and discount retailers often gain customers.",
     "Holds US makers and sellers of everyday goods, weighted by size. It typically includes the big discount and grocery retailers and the large household-goods makers, so it is the closest index fund to the Walmart, Target and Dollar General kind of company.",
     "Capture the return of the US consumer staples sector.", ("defensive",)),
    ("VOX", "Communication services", "Communication services sector", "VTCAX", None, "MSCI US IMI Communication Services 25/50",
     "Telecom, media, social media and internet search companies. Today it is dominated by a few very large internet platforms.",
     "Holds US telecom, media and interactive-media companies, weighted by size.",
     "Capture the return of the US communication services sector.", ("ai-software",)),
    ("VPU", "Utilities", "Utilities sector", "VUIAX", "XLU", "MSCI US IMI Utilities 25/50",
     "Electric, gas and water companies with regulated, steady demand. Often steadier in stock-market falls, but sensitive to interest rates.",
     "Holds US regulated and independent power, gas and water utilities, weighted by size.",
     "Capture the return of the US utilities sector.", ("defensive", "dividend")),
    ("VAW", "Materials", "Materials sector", "VMIAX", "XLB", "MSCI US IMI Materials 25/50",
     "Chemicals, metals, mining, packaging and construction materials. Follows global industrial demand.",
     "Holds US materials companies weighted by size: chemical makers, miners and packaging firms.",
     "Capture the return of the US materials sector.", ()),
]
for tk, cat, short, mf, xl, idx, purpose, overview, goal, tags in sectors:
    note = (XL_NOTE.format(xl=xl) if xl else "") + VERIFY
    NEW.append(fund(tk, f"US {cat}", short, "sector", "Sector funds", "us", "stock", 100, "etf", "index", idx,
                    {"Vanguard": [mf, tk]}, tk, [xl] if xl else [], purpose, overview, goal, note, ("sector",) + tags))

# -------------------------------------------------------------------- themes
NEW += [
    fund("IGV", "Software (iShares Expanded Tech-Software)", "Software", "sector", "Themes: AI, software and chips", "us", "stock", 100, "etf", "index",
         "S&P North American Expanded Technology Software Index", {"Other": ["IGV"]}, "IGV", [],
         "A pure play on software companies, the group most exposed if enthusiasm for software and AI applications cools.",
         "Holds North American software and related companies. Useful as a yardstick for how a software-heavy portfolio behaves.",
         "Capture the return of North American software stocks.", "Not a Vanguard or Schwab fund. " + VERIFY, ("sector", "ai-software")),
    fund("SMH", "Semiconductors (VanEck)", "Semiconductors", "sector", "Themes: AI, software and chips", "global", "stock", 100, "etf", "index",
         "MarketVector US Listed Semiconductor 25 Index", {"Other": ["SMH"]}, "SMH", [],
         "Computer-chip makers, the hardware layer of AI. Very volatile: big gains in booms and deep falls in busts.",
         "Holds about 25 of the largest chip designers and makers listed in the US. A few very large companies dominate.",
         "Capture the return of leading semiconductor companies.", "Not a Vanguard or Schwab fund. " + VERIFY, ("sector", "ai-software")),
    fund("BOTZ", "Robotics and AI (Global X)", "Robotics & AI", "sector", "Themes: AI, software and chips", "global", "stock", 100, "etf", "index",
         "Indxx Artificial Intelligence & Big Data / Robotics index (name has changed over time)", {"Other": ["BOTZ"]}, "BOTZ", [],
         "A thematic fund built around robotics, automation and AI. Short history and large swings.",
         "Holds companies worldwide involved in robotics, automation and artificial intelligence.",
         "Capture the return of companies tied to robotics and AI.", "Short history, so it does not cover the 2000 or 2008 declines. " + VERIFY, ("sector", "ai-software")),
    fund("AIQ", "Artificial Intelligence & Technology (Global X)", "AI & technology", "sector", "Themes: AI, software and chips", "global", "stock", 100, "etf", "index",
         "Indxx Artificial Intelligence & Big Data Index", {"Other": ["AIQ"]}, "AIQ", [],
         "A thematic fund holding companies that build or use AI and big-data technology.",
         "Holds technology and internet companies worldwide that the index provider rates as AI-related. Overlaps heavily with large US technology stocks.",
         "Capture the return of AI-related companies.", "Short history, so it does not cover the 2000 or 2008 declines. " + VERIFY, ("sector", "ai-software")),
    fund("QQQ", "Nasdaq-100 (Invesco QQQ)", "Nasdaq-100", "us-stock", "Growth", "us", "stock", 100, "etf", "index",
         "Nasdaq-100 Index", {"Other": ["QQQ", "QQQM"]}, "QQQ", [],
         "The 100 largest non-financial Nasdaq companies. Heavily weighted to the big technology and internet names, so a good gauge of tech-boom and tech-bust behavior.",
         "Holds the 100 largest non-financial companies on the Nasdaq exchange, weighted by size. Technology, internet and software companies are most of it.",
         "Match the Nasdaq-100 Index.", "Not a Vanguard or Schwab fund. Fell about 80% from 2000 to 2002. " + VERIFY, ("ai-software",)),
    fund("MGK", "US Mega-Cap Growth", "Mega-cap growth", "us-stock", "Growth", "us", "stock", 100, "etf", "index",
         "CRSP US Mega Cap Growth Index", {"Vanguard": ["VMGAX", "MGK"]}, "MGK", [],
         "The very largest US growth companies. Concentrated in a handful of technology and internet names.",
         "Holds roughly 70 of the largest US growth stocks, weighted by size, so the top few holdings are a large share of the fund.",
         "Match the return of the largest US growth stocks.", VERIFY, ("ai-software",)),
]

# ------------------------------------------------------------ factor / strategy
NEW += [
    fund("RSP", "S&P 500 Equal Weight", "S&P 500 equal weight", "us-stock", "Strategy funds", "us", "stock", 100, "etf", "index",
         "S&P 500 Equal Weight Index", {"Other": ["RSP"]}, "RSP", [],
         "The same 500 companies as the S&P 500 but each held in equal amounts, so the biggest handful of companies don't dominate.",
         "Holds all S&P 500 companies at about the same weight each, rebalanced regularly. It owns far less of the largest technology names than a normal S&P 500 fund.",
         "Spread the S&P 500's risk across all of its companies.", "Not a Vanguard or Schwab fund. " + VERIFY, ("factor",)),
    fund("MTUM", "US Momentum (iShares)", "Momentum", "us-stock", "Strategy funds", "us", "stock", 100, "etf", "index",
         "MSCI USA Momentum SSE Index", {"Other": ["MTUM"]}, "MTUM", [],
         "Buys stocks that have recently risen the most. Does well in long trends and can be hit hard when the market turns.",
         "Holds US stocks with the strongest recent price gains, reshuffled a few times a year.",
         "Capture the momentum factor.", "Not a Vanguard or Schwab fund. " + VERIFY, ("factor",)),
    fund("QUAL", "US Quality (iShares)", "Quality", "us-stock", "Strategy funds", "us", "stock", 100, "etf", "index",
         "MSCI USA Sector Neutral Quality Index", {"Other": ["QUAL"]}, "QUAL", [],
         "Favors profitable companies with steady earnings and low debt.",
         "Holds US large and mid-size companies the index rates high on return on equity, earnings stability and low leverage.",
         "Capture the quality factor.", "Not a Vanguard or Schwab fund. " + VERIFY, ("factor",)),
    fund("USMV", "US Minimum Volatility (iShares)", "Minimum volatility", "us-stock", "Strategy funds", "us", "stock", 100, "etf", "index",
         "MSCI USA Minimum Volatility Index", {"Other": ["USMV"]}, "USMV", [],
         "Built to fall less than the market in a decline, at the cost of lagging in strong rallies.",
         "Holds US stocks picked and weighted to produce lower overall volatility than the market, with limits on any one sector.",
         "Deliver a smoother ride than the broad US market.", "Not a Vanguard or Schwab fund. " + VERIFY, ("factor", "defensive")),
    fund("SPLV", "S&P 500 Low Volatility (Invesco)", "Low volatility", "us-stock", "Strategy funds", "us", "stock", 100, "etf", "index",
         "S&P 500 Low Volatility Index", {"Other": ["SPLV"]}, "SPLV", [],
         "Holds the 100 least volatile S&P 500 stocks, which tilts toward utilities, staples and health care.",
         "Holds the 100 S&P 500 stocks with the lowest volatility over the past year, weighted by how steady they were.",
         "Deliver smaller declines than the S&P 500.", "Not a Vanguard or Schwab fund. " + VERIFY, ("factor", "defensive")),
    fund("NOBL", "Dividend Aristocrats (ProShares)", "Dividend aristocrats", "us-stock", "Dividend", "us", "stock", 100, "etf", "index",
         "S&P 500 Dividend Aristocrats Index", {"Other": ["NOBL"]}, "NOBL", [],
         "Companies that have raised their dividends for 25 years in a row, which tilts toward steady, established firms.",
         "Holds S&P 500 companies with at least 25 consecutive years of dividend increases, each at roughly equal weight.",
         "Capture long-running dividend growers.", "Not a Vanguard or Schwab fund. " + VERIFY, ("dividend",)),
    fund("JEPI", "Equity Premium Income (JPMorgan)", "Covered-call income", "us-stock", "Dividend", "us", "stock", 100, "etf", "active",
         "Actively managed; no index", {"Other": ["JEPI"]}, "JEPI", [],
         "Pays high income by holding lower-volatility stocks and selling options. Falls less in some declines but gives up much of the gains in strong rallies.",
         "Holds a basket of US large-company stocks and sells call options on the S&P 500 to generate monthly income.",
         "Pay a high income with less volatility than the market.", "Short history, started in 2020. Not a Vanguard or Schwab fund. " + VERIFY, ("dividend",)),
    fund("VEIRX", "Equity Income (Vanguard, active)", "Equity income", "us-stock", "Dividend", "us", "stock", 100, "mutual-fund", "active",
         "Actively managed; benchmark FTSE High Dividend Yield Index", {"Vanguard": ["VEIRX", "VEIPX"]}, "VEIRX", ["VEIPX"],
         "An actively managed fund of large, higher-yielding US companies.",
         "Holds dividend-paying US companies chosen by outside managers, tilted toward steadier, higher-yielding firms.",
         "Pay above-market income and grow it over time.", "Earlier history uses the Investor share class (VEIPX). " + VERIFY, ("dividend",)),
]

# ---------------------------------------------------------------- tax-managed
NEW += [
    fund("VTCLX", "Tax-Managed Capital Appreciation", "Tax-managed US stock", "us-stock", "Tax-managed", "us", "stock", 100, "mutual-fund", "index",
         "Russell 1000 Index", {"Vanguard": ["VTCLX"]}, "VTCLX", ["VTCIX"],
         "A broad US large-company stock fund run to minimize taxable distributions, for money held in a regular (taxable) account.",
         "Holds large and mid-size US stocks tracking the Russell 1000 Index. It avoids selling shares at a gain and offsets gains with losses where it can.",
         "Match the Russell 1000 while keeping taxable distributions low.",
         "Before-tax returns look much like a regular index fund; the benefit is a smaller tax bill, which these charts do not show. Earlier history uses another share class (VTCIX). " + VERIFY,
         ("tax-managed",)),
    fund("VTMSX", "Tax-Managed Small-Cap", "Tax-managed small-cap", "us-stock", "Tax-managed", "us", "stock", 100, "mutual-fund", "index",
         "S&P SmallCap 600 Index", {"Vanguard": ["VTMSX"]}, "VTMSX", [],
         "A small-company US stock fund run to keep taxable distributions low.",
         "Holds US small-company stocks tracking the S&P SmallCap 600 Index, using the same tax-minimizing methods as other tax-managed funds.",
         "Match the S&P SmallCap 600 while keeping taxable distributions low.",
         "Before-tax returns look much like other small-cap funds; the tax benefit is not shown here. " + VERIFY, ("tax-managed",)),
    fund("VTMFX", "Tax-Managed Balanced", "Tax-managed balanced", "balanced", "Tax-managed", "us", "mixed", 50, "mutual-fund", "allocation",
         "Mix of Russell 1000 stocks and Bloomberg Municipal bonds", {"Vanguard": ["VTMFX"]}, "VTMFX", [],
         "About half US stocks and half tax-exempt municipal bonds in one fund, aimed at investors in a taxable account.",
         "Holds roughly half its money in US large-company stocks and half in intermediate municipal bonds whose interest is free of federal income tax.",
         "Provide a balanced mix with a low tax bill.", VERIFY, ("tax-managed",)),
    fund("VMLUX", "Limited-Term Tax-Exempt", "Short municipal bonds", "bond", "Municipal", "us", "bond", 0, "mutual-fund", "index",
         "Bloomberg 1-5 Year Municipal Bond Index", {"Vanguard": ["VMLUX"]}, "VMLUX", ["VMLTX"],
         "Short-maturity municipal bonds with interest free of federal income tax. Small price swings.",
         "Holds municipal bonds with short maturities, so interest-rate changes affect it less than longer municipal funds.",
         "Pay tax-free income with low volatility.", "Earlier history uses the Investor share class (VMLTX). " + VERIFY, ("tax-managed",)),
    fund("VWIUX", "Intermediate-Term Tax-Exempt", "Intermediate municipal bonds", "bond", "Municipal", "us", "bond", 0, "mutual-fund", "active",
         "Actively managed; benchmark Bloomberg 1-17 Year Municipal Bond Index", {"Vanguard": ["VWIUX"]}, "VWIUX", ["VWITX"],
         "Mid-maturity municipal bonds with interest free of federal income tax.",
         "Holds investment-grade municipal bonds with intermediate maturities.",
         "Pay tax-free income with moderate volatility.", "Earlier history uses the Investor share class (VWITX). " + VERIFY, ("tax-managed",)),
    fund("VWLUX", "Long-Term Tax-Exempt", "Long municipal bonds", "bond", "Municipal", "us", "bond", 0, "mutual-fund", "active",
         "Actively managed; benchmark Bloomberg Municipal Bond Index", {"Vanguard": ["VWLUX"]}, "VWLUX", ["VWLTX"],
         "Longer-maturity municipal bonds paying higher tax-free income, with larger price swings when rates move.",
         "Holds investment-grade municipal bonds with long maturities.",
         "Pay higher tax-free income, accepting more interest-rate risk.", "Earlier history uses the Investor share class (VWLTX). " + VERIFY, ("tax-managed",)),
    fund("VCADX", "California Intermediate-Term Tax-Exempt", "California municipal bonds", "bond", "Municipal", "us", "bond", 0, "mutual-fund", "active",
         "Actively managed; benchmark Bloomberg California Municipal Bond Index (1-17 Year)", {"Vanguard": ["VCADX"]}, "VCADX", ["VCAIX"],
         "Municipal bonds from California issuers. For California residents the interest is generally free of both federal and California income tax.",
         "Holds investment-grade California municipal bonds with intermediate maturities. It is concentrated in one state's issuers.",
         "Pay income free of federal and California tax.", "Earlier history uses the Investor share class (VCAIX). Tax treatment depends on your state and situation. " + VERIFY, ("tax-managed",)),
]

# -------------------------------------------------------------------- bonds/cash
NEW += [
    fund("BIL", "1-3 Month Treasury Bills (SPDR)", "T-bill ETF", "bond", "Cash-like", "us", "bond", 0, "etf", "index",
         "Bloomberg 1-3 Month U.S. Treasury Bill Index", {"Other": ["BIL"]}, "BIL", [],
         "The safest place to park money that still earns something: very short US Treasury bills.",
         "Holds US Treasury bills maturing within about three months. Its price barely moves, and the income rises and falls with short-term interest rates.",
         "Preserve money and earn the short-term Treasury rate.", "Not a Vanguard or Schwab fund. " + VERIFY, ("defensive",)),
    fund("SGOV", "0-3 Month Treasury (iShares)", "T-bill ETF (SGOV)", "bond", "Cash-like", "us", "bond", 0, "etf", "index",
         "ICE 0-3 Month US Treasury Securities Index", {"Other": ["SGOV"]}, "SGOV", [],
         "Very short Treasury bills, similar to BIL, with a shorter history.",
         "Holds US Treasury bills with up to three months to maturity.", "Preserve money and earn the short-term Treasury rate.",
         "Short history, started in 2020. Not a Vanguard or Schwab fund. " + VERIFY, ("defensive",)),
    fund("VWEAX", "High-Yield Corporate (Vanguard, active)", "High-yield bonds", "bond", "Corporate", "us", "bond", 0, "mutual-fund", "active",
         "Actively managed; benchmark Bloomberg U.S. High Yield Corporate Bond Index", {"Vanguard": ["VWEAX", "VWEHX"]}, "VWEAX", ["VWEHX"],
         "Bonds of less creditworthy companies that pay higher interest. They fall with stocks in a crisis.",
         "Holds mostly bonds rated below investment grade, with some higher-rated holdings.",
         "Pay high income, accepting more credit risk.", "Earlier history uses the Investor share class (VWEHX). " + VERIFY),
    fund("VCSH", "Short-Term Corporate Bonds", "Short corporate bonds", "bond", "Corporate", "us", "bond", 0, "etf", "index",
         "Bloomberg U.S. 1-5 Year Corporate Bond Index", {"Vanguard": ["VSCSX", "VCSH"]}, "VCSH", [],
         "Investment-grade company bonds with short maturities. Pays more than Treasuries with small price swings.",
         "Holds investment-grade US corporate bonds maturing in one to five years.",
         "Pay more income than Treasuries with low interest-rate risk.", VERIFY),
    fund("VMBS", "Mortgage-Backed Securities", "Mortgage-backed bonds", "bond", "Mortgage-backed", "us", "bond", 0, "etf", "index",
         "Bloomberg U.S. MBS Float Adjusted Index", {"Vanguard": ["VMBSX", "VMBS"]}, "VMBS", [],
         "Bonds backed by pools of home mortgages guaranteed by US government agencies.",
         "Holds agency mortgage-backed securities, which pay interest and return principal as homeowners pay their loans.",
         "Pay income above Treasuries with government-agency backing.", VERIFY),
    fund("VWOB", "Emerging Markets Government Bonds", "Emerging-market bonds", "bond", "International bonds", "intl", "bond", 0, "etf", "index",
         "Bloomberg USD Emerging Markets Government RIC Capped Index", {"Vanguard": ["VWOB"]}, "VWOB", [],
         "Dollar-denominated bonds from emerging-market governments. Higher income, with credit and political risk.",
         "Holds US-dollar bonds issued by emerging-market governments and related agencies.",
         "Pay higher income from emerging-market issuers.", VERIFY),
]

# ---------------------------------------------------------- active balanced / sector
NEW += [
    fund("VWENX", "Wellington (Vanguard, active)", "Wellington", "balanced", "Active balanced", "us", "mixed", 65, "mutual-fund", "active",
         "Actively managed; benchmark roughly 65% stocks and 35% bonds", {"Vanguard": ["VWENX", "VWELX"]}, "VWENX", ["VWELX"],
         "One of the oldest balanced funds in the US: roughly two-thirds stocks and one-third bonds, picked by an outside manager.",
         "Holds US large-company stocks (leaning toward value and dividend payers) and investment-grade bonds.",
         "Provide growth and income with less risk than an all-stock fund.", "Earlier history uses the Investor share class (VWELX). " + VERIFY),
    fund("VWIAX", "Wellesley Income (Vanguard, active)", "Wellesley Income", "balanced", "Active balanced", "us", "mixed", 38, "mutual-fund", "active",
         "Actively managed; benchmark roughly 35-40% stocks and 60-65% bonds", {"Vanguard": ["VWIAX", "VWINX"]}, "VWIAX", ["VWINX"],
         "A conservative income fund: mostly bonds with a smaller slice of higher-dividend stocks.",
         "Holds investment-grade bonds and dividend-paying stocks, picked by an outside manager.",
         "Provide income with relatively low risk.", "Earlier history uses the Investor share class (VWINX). " + VERIFY),
    fund("VGHCX", "Health Care (Vanguard, active)", "Health Care fund (active)", "sector", "Sector funds", "global", "stock", 100, "mutual-fund", "active",
         "Actively managed; benchmark MSCI World Health Care Index", {"Vanguard": ["VGHCX"]}, "VGHCX", [],
         "An actively managed fund of drug, biotech and device companies. Health care has historically held up better than most sectors in recessions.",
         "Holds health care companies around the world, picked by outside managers. A large share is in US drug makers.",
         "Grow capital by investing in health care companies.", "Investor share class. " + VERIFY, ("sector", "defensive")),
]

# -------------------------------------------------------------------- global, regional
NEW += [
    fund("VT", "Total World Stock", "Total world stock", "intl-stock", "Global", "global", "stock", 100, "etf", "index",
         "FTSE Global All Cap Index", {"Vanguard": ["VTWAX", "VT"]}, "VT", [],
         "One fund holding stocks from around the world, roughly 60% US. A complete global stock portfolio in a single line.",
         "Holds thousands of stocks across developed and emerging markets, weighted by size.",
         "Match the global stock market.", VERIFY),
    fund("VSS", "International Small-Cap", "International small-cap", "intl-stock", "Developed international", "intl", "stock", 100, "etf", "index",
         "FTSE Global Small Cap ex US Index", {"Vanguard": ["VFSVX", "VSS"]}, "VSS", [],
         "Smaller companies outside the US, an area most broad international funds hold little of.",
         "Holds thousands of small companies in developed and emerging countries outside the US.",
         "Match the return of small international companies.", VERIFY),
    fund("EWJ", "Japan (iShares MSCI)", "Japan", "intl-stock", "Countries", "intl", "stock", 100, "etf", "index",
         "MSCI Japan Index", {"Other": ["EWJ"]}, "EWJ", [],
         "The world's third-largest stock market. Useful for comparing: Japan's market stayed below its 1989 peak for decades.",
         "Holds large and mid-size Japanese companies, weighted by size.", "Match the Japanese stock market.",
         "Not a Vanguard or Schwab fund. " + VERIFY),
    fund("FXI", "China Large-Cap (iShares)", "China large-cap", "intl-stock", "Countries", "intl", "stock", 100, "etf", "index",
         "FTSE China 50 Index", {"Other": ["FXI"]}, "FXI", [],
         "About 50 of the largest Chinese companies listed in Hong Kong. A concentrated, volatile bet on one country.",
         "Holds roughly 50 large Chinese companies, mostly banks, internet and energy firms.", "Match large Chinese stocks.",
         "Not a Vanguard or Schwab fund. " + VERIFY),
    fund("INDA", "India (iShares MSCI)", "India", "intl-stock", "Countries", "intl", "stock", 100, "etf", "index",
         "MSCI India Index", {"Other": ["INDA"]}, "INDA", [],
         "Large and mid-size Indian companies, a fast-growing economy with a volatile market.",
         "Holds Indian companies weighted by size, led by banks, technology services and energy.", "Match the Indian stock market.",
         "Short history, started in 2012. Not a Vanguard or Schwab fund. " + VERIFY),
]

# --------------------------------------------------------------- hedges / commodities
NEW += [
    fund("DBMF", "Managed Futures Strategy (iMGP DBi)", "Managed futures", "alternatives", "Hedges", "global", "other", None, "etf", "active",
         "Replicates the average positions of large managed-futures hedge funds", {"Other": ["DBMF"]}, "DBMF", [],
         "Trend-following funds buy what is rising and sell what is falling across stocks, bonds, currencies and commodities. They sometimes profit in prolonged declines, such as 2022, but can lose in sudden reversals.",
         "Holds futures contracts and cash, adjusting positions based on recent price trends, with no fixed stock or bond share.",
         "Add returns that don't move with stocks and bonds.", "Short history, started in 2019, so it misses 2000 and 2008. Not a Vanguard or Schwab fund. " + VERIFY, ("defensive",)),
    fund("BTAL", "Anti-Beta (AGF US Market Neutral)", "Anti-beta", "alternatives", "Hedges", "us", "other", None, "etf", "index",
         "Dow Jones U.S. Thematic Market Neutral Anti-Beta Index", {"Other": ["BTAL"]}, "BTAL", [],
         "Buys the least market-sensitive US stocks and bets against the most market-sensitive. It has tended to rise when stocks fall, but can lose steadily in rallies.",
         "Holds a long position in low-beta US stocks and an equal short position in high-beta stocks.",
         "Provide returns that move opposite to the stock market.", "Hedge fund-style strategy that costs money to hold in good times. Started in 2011. Not a Vanguard or Schwab fund. " + VERIFY, ("defensive",)),
    fund("TAIL", "Tail Risk (Cambria)", "Tail-risk hedge", "alternatives", "Hedges", "us", "other", None, "etf", "active",
         "Actively managed: Treasuries plus put options on the S&P 500", {"Other": ["TAIL"]}, "TAIL", [],
         "Holds Treasuries and buys protective options that pay off in sharp stock-market declines. Insurance that usually costs a little each year.",
         "Holds mostly US Treasury securities and a layer of put options on the S&P 500.",
         "Pay off in a large stock-market decline.", "Short history, started in 2017. Not a Vanguard or Schwab fund. " + VERIFY, ("defensive",)),
    fund("DBC", "Broad Commodities (Invesco DB)", "Commodities", "real-assets", "Commodities", "global", "other", None, "etf", "commodity",
         "DBIQ Optimum Yield Diversified Commodity Index Excess Return", {"Other": ["DBC"]}, "DBC", [],
         "A basket of oil, metals and farm commodities. Often rises with inflation but is very volatile and fell sharply in 2008.",
         "Holds futures contracts on about 14 commodities: energy, metals and agriculture.",
         "Track broad commodity prices.", "Not a Vanguard or Schwab fund. " + VERIFY),
]

# ------------------------------------------------------------------------ blends
BL = [
    ("BLEND8020", "80/20", 80, {"VFIAX": 0.8, "VBTLX": 0.2}),
    ("BLEND7030", "70/30", 70, {"VFIAX": 0.7, "VBTLX": 0.3}),
    ("BLEND5050", "50/50", 50, {"VFIAX": 0.5, "VBTLX": 0.5}),
    ("BLEND4060", "40/60", 40, {"VFIAX": 0.4, "VBTLX": 0.6}),
    ("BLEND3070", "30/70", 30, {"VFIAX": 0.3, "VBTLX": 0.7}),
    ("BLEND2080", "20/80", 20, {"VFIAX": 0.2, "VBTLX": 0.8}),
]
for bid, label, eq, w in BL:
    NEW.append(blend(bid, f"{label} Stock/Bond Blend (hypothetical)", f"{label} blend", eq, w,
                     f"Calculated here: {eq}% S&P 500 fund, {100 - eq}% Total Bond Market fund, rebalanced monthly",
                     f"A yardstick for a {eq}% stock, {100 - eq}% bond portfolio.",
                     f"Computed by this app from the weekly returns of the S&P 500 line and the Total Bond Market line, rebalanced each month. It ignores trading costs and taxes."))
NEW.append(blend("BLENDPERM", "Four-way Blend: stocks, long bonds, gold, cash (hypothetical)", "Stocks/bonds/gold/cash", 25,
                 {"VFIAX": 0.25, "VBLAX": 0.25, "GLD": 0.25, "CASH": 0.25},
                 "Calculated here: 25% each in the S&P 500 fund, Long-Term Bond fund, gold ETF and 3-month Treasury bills, rebalanced monthly",
                 "A well-known 'something for every economy' mix: stocks for growth, long bonds for recessions, gold for inflation and cash for stability.",
                 "Computed by this app. It starts in 2004 when the gold ETF began. Hypothetical, ignores costs and taxes."))

# -------------------------------------------------------------- tags on old entries
OLD_TAGS = {"VIG": ["dividend"], "VYM": ["dividend"], "SCHD": ["dividend"],
            "GLD": ["defensive"], "VGSH": ["defensive"], "VGIT": ["defensive"],
            "VBIRX": ["defensive"], "VBTLX": ["defensive"], "VTIP": ["defensive"]}


def main() -> int:
    doc = json.loads(PATH.read_text(encoding="utf-8"))
    have = {e["id"] for e in doc["funds"]}
    added = 0
    for e in NEW:
        if e["id"] in have:
            continue
        doc["funds"].append(e)
        added += 1
    for e in doc["funds"]:
        if e["id"] in OLD_TAGS and "tags" not in e:
            e["tags"] = OLD_TAGS[e["id"]]
    doc["version"] = 2
    PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"added {added}; total {len(doc['funds'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
