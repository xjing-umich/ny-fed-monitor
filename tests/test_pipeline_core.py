import json

from sec_data_pipeline.metrics import calculate_derived_metrics
from sec_data_pipeline.normalize import normalize_company_facts
from sec_data_pipeline.prompts import ai_prompt_payload
from sec_data_pipeline.quality import build_quality_gate
from sec_data_pipeline.schema import connect, initialize
from sec_data_pipeline.store import upsert_normalized, upsert_quality_gate


def fact(tag, units):
    return {"facts": {"us-gaap": {tag: {"units": units}}}}


def merge_facts(*payloads):
    merged = {"facts": {"us-gaap": {}}}
    for payload in payloads:
        merged["facts"]["us-gaap"].update(payload["facts"]["us-gaap"])
    return merged


def usd(val, fy, fp="FY", form="10-K"):
    return [{"val": val, "fy": fy, "fp": fp, "form": form, "filed": f"{fy + 1}-02-01", "frame": f"CY{fy}"}]


def test_normalize_company_facts_and_derived_metrics(tmp_path):
    facts = merge_facts(
        fact("Revenues", {"USD": usd(100, 2022) + usd(120, 2023)}),
        fact("CostOfRevenue", {"USD": usd(40, 2022) + usd(48, 2023)}),
        fact("OperatingIncomeLoss", {"USD": usd(20, 2022) + usd(30, 2023)}),
        fact("NetIncomeLoss", {"USD": usd(10, 2022) + usd(18, 2023)}),
        fact("NetCashProvidedByUsedInOperatingActivities", {"USD": usd(16, 2022) + usd(24, 2023)}),
        fact("PaymentsToAcquirePropertyPlantAndEquipment", {"USD": usd(4, 2022) + usd(6, 2023)}),
        fact("CashAndCashEquivalentsAtCarryingValue", {"USD": usd(30, 2022) + usd(25, 2023)}),
        fact("Assets", {"USD": usd(200, 2022) + usd(240, 2023)}),
        fact("AssetsCurrent", {"USD": usd(80, 2022) + usd(90, 2023)}),
        fact("Liabilities", {"USD": usd(90, 2022) + usd(100, 2023)}),
        fact("LiabilitiesCurrent", {"USD": usd(40, 2022) + usd(45, 2023)}),
        fact("LongTermDebt", {"USD": usd(50, 2022) + usd(60, 2023)}),
        fact("StockholdersEquity", {"USD": usd(110, 2022) + usd(140, 2023)}),
        fact("EntityCommonStockSharesOutstanding", {"shares": usd(10, 2022) + usd(11, 2023)}),
    )
    periods = normalize_company_facts("TST", "0000000001", facts)
    assert len(periods) == 2
    assert periods[-1].statements["gross_profit"] == 72
    assert periods[-1].statements["free_cash_flow"] == 18

    conn = connect(tmp_path / "test.db")
    initialize(conn)
    upsert_normalized(conn, periods)
    calculate_derived_metrics(conn, "TST")
    metric = conn.execute("SELECT * FROM derived_metrics WHERE ticker='TST' AND fiscal_year=2023").fetchone()
    assert round(metric["gross_margin"], 4) == 0.6
    assert round(metric["revenue_growth_yoy"], 4) == 0.2
    assert round(metric["share_count_change_yoy"], 4) == 0.1


def test_quality_gate_and_prompt_payload_exclude_raw_sec_json(tmp_path):
    conn = connect(tmp_path / "test.db")
    initialize(conn)
    facts = merge_facts(
        fact("Revenues", {"USD": usd(100, 2021) + usd(110, 2022) + usd(120, 2023)}),
        fact("GrossProfit", {"USD": usd(50, 2021) + usd(55, 2022) + usd(60, 2023)}),
        fact("OperatingIncomeLoss", {"USD": usd(20, 2021) + usd(22, 2022) + usd(24, 2023)}),
        fact("NetIncomeLoss", {"USD": usd(10, 2021) + usd(11, 2022) + usd(12, 2023)}),
        fact("NetCashProvidedByUsedInOperatingActivities", {"USD": usd(15, 2021) + usd(16, 2022) + usd(17, 2023)}),
        fact("PaymentsToAcquirePropertyPlantAndEquipment", {"USD": usd(3, 2021) + usd(4, 2022) + usd(5, 2023)}),
        fact("CashAndCashEquivalentsAtCarryingValue", {"USD": usd(20, 2021) + usd(21, 2022) + usd(22, 2023)}),
        fact("Assets", {"USD": usd(200, 2021) + usd(210, 2022) + usd(220, 2023)}),
        fact("Liabilities", {"USD": usd(80, 2021) + usd(85, 2022) + usd(90, 2023)}),
        fact("StockholdersEquity", {"USD": usd(120, 2021) + usd(125, 2022) + usd(130, 2023)}),
    )
    upsert_normalized(conn, normalize_company_facts("TST", "0000000001", facts))
    calculate_derived_metrics(conn, "TST")
    gate = build_quality_gate(conn, "TST")
    upsert_quality_gate(conn, gate)
    payload = ai_prompt_payload(conn, "TST")
    assert payload["policy"]["raw_sec_json_included"] is False
    assert "raw_company_facts" not in json.dumps(payload)
    assert "Do not make peer-relative claims." in payload["quality_gate"]["forbidden_ai_claims"]
