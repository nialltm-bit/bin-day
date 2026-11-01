"""The arithmetic of the open-data UPRN spike. The data and the OpenStreetMap service need the network."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "spike_osm_uprn.py"
SPEC = importlib.util.spec_from_file_location("spike_osm_uprn", SCRIPT)
spike = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(spike)

HOME = (51.0, -1.0)
NEIGHBOURS = {"1": (51.0, -1.0), "2": (51.00005, -1.0)}  # the second is about 5.5 m north


def test_a_house_number_object_on_the_home_with_a_matching_postcode_leads_back_to_it():
    objects = [{"lat": 51.00001, "lon": -1.0, "postcode": "AB1 2CD"}]
    assert spike.judge("1", HOME, NEIGHBOURS, objects, "ab12cd") == {"covered": True, "postcode": True, "roundtrip": True}


def test_an_object_without_a_postcode_is_covered_but_not_a_postcode_match():
    objects = [{"lat": 51.00001, "lon": -1.0, "postcode": None}]
    assert spike.judge("1", HOME, NEIGHBOURS, objects, "AB1 2CD")["postcode"] is False


def test_an_object_nearer_a_neighbour_leads_to_the_wrong_home():
    objects = [{"lat": 51.00004, "lon": -1.0, "postcode": "AB1 2CD"}]  # within 15 m of the home, nearer UPRN 2
    assert spike.judge("1", HOME, NEIGHBOURS, objects, "AB1 2CD")["roundtrip"] is False


def test_nothing_within_fifteen_metres_is_not_covered():
    objects = [{"lat": 51.001, "lon": -1.0, "postcode": "AB1 2CD"}]
    assert spike.judge("1", HOME, NEIGHBOURS, objects, "AB1 2CD") == {"covered": False, "postcode": False, "roundtrip": False}


def test_only_numeric_uprns_are_test_homes():
    inputs = {
        "A": {"uprn": "100012345678", "postcode": "AB1 2CD"},
        "B": {"uprn": "abc"},
        "C": {"postcode": "AB1 2CD"},
        "D": {"uprn": "123"},
    }
    assert spike.test_homes(inputs) == {"A": ("100012345678", "AB1 2CD")}
