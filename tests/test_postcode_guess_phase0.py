# ruff: noqa: E501
"""The phase 0 measuring scripts for the postcode guess (FRE-298): reading ONSUD, drawing postcodes, comparing homes."""
import json
import random
import zipfile
from datetime import date

import pytest

from fetcher.model import Collection, FetchError, UnmappedBinError, UpstreamError
from scripts import onsud, onsud_stats, postcode_report, postcode_sample
from scripts import postcode_agreement as agreement

HEADER = "UPRN,GRIDGB1E,PCDS,CTY25CD,LAD25CD,WARD25CD"


def make_zip(path, files):
    with zipfile.ZipFile(path, "w") as archive:
        for name, text in files.items():
            archive.writestr(name, text)


def rows(*lines, header=HEADER):
    return "\n".join([header, *lines]) + "\n"


@pytest.fixture
def release(tmp_path):
    path = tmp_path / "onsud.zip"
    make_zip(
        path,
        {
            "Data/multi_csv/ONSUD_BA.csv": rows(
                "1,0,BA3 4XX,E1,E06000022,W1",
                "2,0,BA3 4XX,E1,E06000022,W1",
                "3,0,BA3 4XX,E1,E06000022,W1",
                "4,0,BA3 4XY,E1,E06000022,W1",
                "5,0,BA3 4XY,E1,E07000078,W1",  # a postcode that straddles two councils
                "6,0,BA1  2ab,E1,E06000022,W1",  # lower case and a double space still reads
                "7,0,,E1,E06000022,W1",  # no postcode
                "8,0,BA1 2AB,E1,,W1",  # no council
            ),
            "Data/multi_csv/ONSUD_GL.csv": rows("9,0,GL50 1AA,E1,E07000078,W1", "10,0,GL50 1AA,E1,E07000078,W1"),
            "Documents/guide.csv": "Field,Meaning\nUPRN,the reference\n",  # a guide with no data columns is skipped
        },
    )
    return str(path)


def test_columns_are_found_whatever_the_case_or_year():
    cols = onsud.find_columns(["﻿uprn", "x", "pcds", "lad24cd", "LAD25CD"])
    assert (cols.uprn, cols.postcode, cols.council) == (0, 2, 4)  # the newest year wins
    assert cols.council_name == "lad25cd"


def test_missing_columns_say_what_there_is():
    with pytest.raises(onsud.OnsudError, match="the columns are: uprn, foo"):
        onsud.find_columns(["UPRN", "foo"])


def test_postcodes_are_tidied_and_rubbish_is_refused():
    assert onsud.normalise_postcode("ba34xx") == "BA3 4XX"
    assert onsud.normalise_postcode(" BA1  2ab ") == "BA1 2AB"
    assert onsud.normalise_postcode("") is None
    assert onsud.normalise_postcode("not one") is None
    assert onsud.outcode("BA3 4XX") == "BA3"


def test_rows_skip_what_has_no_postcode_or_council_and_count_it(release):
    totals = onsud.Totals()
    found = list(onsud.rows(release, totals))
    assert len(found) == 8
    assert ("BA1 2AB", "E06000022", 6) in found
    assert (totals.files_read, totals.files_skipped) == (2, 1)
    assert (totals.without_postcode, totals.without_council) == (1, 1)


def test_the_newest_release_is_the_latest_month_and_not_its_user_guide(monkeypatch):
    items = [
        {"title": "ONS UPRN Directory (ONSUD) - May 2026", "modified": 1},
        {"title": "ONS UPRN Directory (ONSUD) - Aug 2026", "modified": 2},
        {"title": "ONS UPRN Directory user guide", "modified": 99},
    ]
    assert sorted(items, key=onsud.release_order, reverse=True)[0]["title"].endswith("Aug 2026")
    items.append({"id": "g", "title": "ONS UPRN Directory (September 2026) (Epoch 128) User Guide", "modified": 5})
    items.append({"id": "r", "title": "ONS UPRN Directory (September 2026) (Epoch 128)", "modified": 4})
    items.append({"id": "l", "title": "ONSUD_LATEST", "modified": 999})
    monkeypatch.setattr(onsud, "candidates", lambda: sorted(items, key=onsud.release_order, reverse=True))
    assert onsud.newest_release()["id"] == "r"


def test_stats_count_uprns_per_postcode_and_size_the_outcode_files(release):
    stats = onsud_stats.build_stats(release)
    assert stats["uprns"] == 8 and stats["postcodes"] == 4
    assert stats["postcodes_spanning_two_or_more_councils"] == 1
    assert stats["uprns_per_postcode"]["max"] == 3
    assert stats["uprns_per_postcode"]["median"] == 2
    assert stats["outcode_files"]["outcodes"] == 3  # BA3, BA1 and GL50
    assert stats["outcode_files"]["json_bytes"]["total"] > 0
    assert stats["per_council"]["E06000022"]["uprns"] == 5
    assert stats["columns_used"]["council"] == "lad25cd"
    assert "BA3 4XX" not in json.dumps(stats) and "BA1 2AB" not in json.dumps(stats)  # the output is public: no full postcodes


def test_percentiles_use_the_nearest_rank():
    assert onsud_stats.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5) == 5
    assert onsud_stats.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95) == 10
    assert onsud_stats.percentile([], 0.5) == 0


def test_the_draw_skips_single_uprn_postcodes_caps_uprns_and_is_repeatable():
    by_postcode = {"A1 1AA": [1], "A1 1AB": [2, 3], "A1 1AC": list(range(100, 160))}
    first = postcode_sample.draw(by_postcode, random.Random(1), 10)
    again = postcode_sample.draw(by_postcode, random.Random(1), 10)
    assert first == again
    assert first["postcodes_with_one_uprn"] == 1 and first["frame_postcodes"] == 2
    big = next(p for p in first["postcodes"] if p["postcode"] == "A1 1AC")
    assert big["total"] == 60 and len(big["uprns"]) == postcode_sample.CAP


def collection(day, stream):
    return Collection(date=day, bin_name=stream, stream=stream)


def test_next_dates_take_the_earliest_future_date_per_stream_and_ignore_garden():
    found = agreement.next_dates(
        [collection("2026-11-02", "general"), collection("2026-11-10", "general"), collection("2026-11-17", "general"),
         collection("2026-11-12", "garden"), collection("2026-11-13", "food")],
        date(2026, 11, 3),
    )
    assert found == {"general": "2026-11-10", "food": "2026-11-13"}


def test_homes_that_share_every_date_agree_and_a_missing_stream_is_not_a_conflict():
    result = agreement.compare_postcode([{"general": "2026-11-10", "food": "2026-11-11"}, {"general": "2026-11-10"}, {"general": "2026-11-10"}])
    assert result["agree"] and result["off_majority"] == 0


def test_a_home_on_the_other_week_is_off_the_majority():
    homes = [{"general": "2026-11-10"}] * 3 + [{"general": "2026-11-17"}]
    result = agreement.compare_postcode(homes)
    assert not result["agree"] and result["off_majority"] == 1
    assert result["kinds"] == ["other_week"] and result["streams"] == ["general"]


def test_a_different_weekday_is_told_apart_from_another_week():
    result = agreement.compare_postcode([{"recycling": "2026-11-10"}, {"recycling": "2026-11-10"}, {"recycling": "2026-11-12"}])
    assert result["kinds"] == ["different_weekday"]


def test_a_tie_goes_to_the_earlier_date_and_is_reported():
    result = agreement.compare_postcode([{"general": "2026-11-17"}, {"general": "2026-11-10"}])
    assert result["tied"] and result["off_majority"] == 1


def test_a_home_off_on_two_streams_counts_once():
    homes = [{"general": "2026-11-10", "food": "2026-11-11"}] * 2 + [{"general": "2026-11-17", "food": "2026-11-18"}]
    assert agreement.compare_postcode(homes)["off_majority"] == 1


def test_errors_are_labelled_without_the_address():
    assert agreement.classify_error(UpstreamError("IndexError", "https://x/?uprn=1")) == "upstream:IndexError"
    assert agreement.classify_error(FetchError("response has no collections")) == "empty"
    assert agreement.classify_error(UnmappedBinError("unmapped bin names: Odd")) == "unmapped_bin_name"
    assert agreement.classify_error(ValueError("x")) == "other:ValueError"


def test_the_confidence_range_is_wide_for_few_postcodes_and_narrow_for_many():
    low, high = agreement.wilson(47, 50)
    assert 0.8 < low < 0.88 and 0.97 < high < 1.0
    low, high = agreement.wilson(940, 1000)
    assert high - low < 0.04
    assert agreement.wilson(0, 0) == (0.0, 0.0)


def test_a_council_description_is_built_from_upstreams_test_input():
    config = {"module": "X", "name": "X", "ons_codes": ["E1"], "needs_selenium": True}
    council = agreement.council_from_input(config, {"url": "https://x.gov.uk", "skip_get_url": True, "postcode": "A1 1AA", "uprn": "1"})
    assert council["inputs"] == ["uprn", "postcode"] and council["needs_selenium"]
    assert council["source"]["skip_get_url"] is True
    assert agreement.council_from_input(config, {"url": "https://x.gov.uk"})["inputs"] == ["uprn"]


def test_the_summary_counts_agreement_and_leaves_out_full_postcodes():
    config = {"module": "X", "name": "X", "platform": "P", "ons_codes": ["E1"]}
    drawn = {"postcodes_in_council": 10, "postcodes_with_one_uprn": 2}
    records = [
        {"outcode": "A1", "uprns_total": 5, "looked_up": 5, "homes_with_dates": 4, "comparable": True, "agree": True, "off_majority": 0, "kinds": [], "streams": []},
        {"outcode": "A2", "uprns_total": 30, "looked_up": 30, "homes_with_dates": 20, "comparable": True, "agree": False, "off_majority": 3, "kinds": ["other_week"], "streams": ["general"]},
        {"outcode": "A3", "uprns_total": 3, "looked_up": 3, "homes_with_dates": 1, "comparable": False},
    ]
    stats = {"seconds": [1.0, 2.0, 3.0], "outcomes": agreement.Counter({"dates": 2, "empty": 1}), "unmapped": agreement.Counter()}
    summary = agreement.summarise(config, drawn, records, stats, "done", "now")
    assert (summary["postcodes_comparable"], summary["postcodes_agreeing"], summary["postcodes_not_comparable"]) == (2, 1, 1)
    assert (summary["homes_compared"], summary["homes_off_majority"]) == (24, 3)
    assert summary["disagreeing_postcodes_by_kind"] == {"other_week": 1}
    assert summary["by_postcode_size"]["25+ UPRNs"] == {"comparable": 1, "agreeing": 0}
    assert summary["seconds_per_lookup"]["median"] == 2.0
    assert "streams" not in summary["postcodes"][1]


def test_the_report_makes_a_table_from_the_council_files(tmp_path):
    config = {"module": "X", "name": "X", "platform": "P", "ons_codes": ["E1"]}
    drawn = {"postcodes_in_council": 1, "postcodes_with_one_uprn": 0}
    stats = {"seconds": [1.0], "outcomes": agreement.Counter({"dates": 1}), "unmapped": agreement.Counter()}
    (tmp_path / "x.json").write_text(json.dumps(agreement.summarise(config, drawn, [], stats, "done", "now")))
    out = tmp_path / "all.json"
    assert postcode_report.main(str(tmp_path), str(out)) == 0
    assert json.loads(out.read_text())["councils"][0]["module"] == "X"




def test_the_whole_check_runs_with_a_fake_scraper_and_keeps_postcodes_out_of_its_output(tmp_path, monkeypatch, capsys):
    """Three postcodes: one where every home agrees, one where a home is on another week, one where nothing comes back."""
    config = {"councils": [{"module": "FakeCouncil", "name": "Fake", "platform": "P", "ons_codes": ["E1"], "needs_selenium": False,
                            "max_lookups": 100, "min_interval_seconds": 0}]}
    postcodes = [
        {"postcode": "ZZ1 1AA", "total": 3, "uprns": [1, 2, 3]},
        {"postcode": "ZZ2 2BB", "total": 3, "uprns": [4, 5, 6]},
        {"postcode": "ZZ3 3CC", "total": 2, "uprns": [7, 8]},
    ]
    (tmp_path / "config.json").write_text(json.dumps(config))
    (tmp_path / "samples.json").write_text(json.dumps({"councils": {"FakeCouncil": {"postcodes_in_council": 9, "postcodes_with_one_uprn": 1, "postcodes": postcodes}}}))
    (tmp_path / "input.json").write_text(json.dumps({"FakeCouncil": {"url": "https://fake.gov.uk", "postcode": "ZZ0 0ZZ"}}))

    def fake_run(council, address, selenium_url=None):
        assert council["inputs"] == ["uprn", "postcode"] and address.postcode
        if address.uprn in ("7", "8"):
            raise UpstreamError("IndexError", f"https://fake.gov.uk/?uprn={address.uprn}&postcode={address.postcode}")
        other_week = address.uprn == "6"
        return {"bins": [{"type": "Refuse", "collectionDate": "17/12/2099" if other_week else "10/12/2099"},
                         {"type": "Garden Waste", "collectionDate": "11/12/2099"}]}

    monkeypatch.setattr(agreement, "run_ukbcd", fake_run)
    out = tmp_path / "out.json"
    agreement.main([str(tmp_path / "config.json"), str(tmp_path / "samples.json"), str(tmp_path / "input.json"), "FakeCouncil", str(out),
                    "--target-postcodes", "10"])
    result = json.loads(out.read_text())
    assert (result["postcodes_checked"], result["postcodes_comparable"], result["postcodes_agreeing"]) == (3, 2, 1)
    assert result["homes_compared"] == 6 and result["homes_off_majority"] == 1
    assert result["lookup_outcomes"] == {"dates": 6, "upstream:IndexError": 2}
    assert result["stopped_because"] == "ran out of drawn postcodes"
    text = out.read_text() + capsys.readouterr().out
    assert "ZZ1" not in text.replace('"outcode": "ZZ1"', "") and "ZZ2 2BB" not in text and "fake.gov.uk/?uprn" not in text


def test_a_bin_that_maps_to_no_stream_is_dropped_and_named_instead_of_losing_the_home():
    response = {"bins": [{"type": "Refuse", "collectionDate": "10/12/2099"}, {"type": "Collect Mattress", "collectionDate": "11/12/2099"},
                         {"type": "Batteries", "collectionDate": "12/12/2099"}]}
    kept, dropped = agreement.drop_unmapped_bins({}, response)
    assert [b["type"] for b in kept["bins"]] == ["Refuse", "Batteries"]  # batteries is on the ignore list, so it goes to normalise
    assert dropped == ["Collect Mattress"]
    assert agreement.drop_unmapped_bins({}, "odd") == ("odd", [])


def test_a_report_of_some_councils_replaces_only_those_and_keeps_the_rest(tmp_path):
    def result(module):
        config = {"module": module, "name": module, "platform": "P", "ons_codes": ["E1"]}
        stats = {"seconds": [1.0], "outcomes": agreement.Counter({"dates": 1}), "unmapped": agreement.Counter()}
        return agreement.summarise(config, {"postcodes_in_council": 1, "postcodes_with_one_uprn": 0}, [], stats, "done", "now")

    out = tmp_path / "all.json"
    out.write_text(json.dumps({"councils": [result("A"), result("B")]}))
    fresh = tmp_path / "fresh"
    fresh.mkdir()
    newer = result("B")
    newer["stopped_because"] = "second run"
    (fresh / "b.json").write_text(json.dumps(newer))
    assert postcode_report.main(str(fresh), str(out)) == 0
    councils = {c["module"]: c for c in json.loads(out.read_text())["councils"]}
    assert set(councils) == {"A", "B"} and councils["B"]["stopped_because"] == "second run"
