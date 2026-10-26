"""A workflow file that isn't valid YAML makes every push fail with a run named after the file, so catch it here."""
from pathlib import Path

import pytest
import yaml

WORKFLOWS = sorted((Path(__file__).resolve().parent.parent / ".github" / "workflows").glob("*.yml"))


def test_there_are_workflows_to_check():
    assert WORKFLOWS


@pytest.mark.parametrize("path", WORKFLOWS, ids=lambda p: p.name)
def test_workflow_is_valid_yaml_with_a_trigger_and_jobs(path):
    data = yaml.safe_load(path.read_text())
    assert isinstance(data, dict)
    assert "name" in data
    assert True in data or "on" in data  # YAML reads a bare `on` as the boolean True
    assert data["jobs"]
