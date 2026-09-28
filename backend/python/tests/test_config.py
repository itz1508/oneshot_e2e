from app.config import get_config


def test_python_config_loads_root_toml():
    config = get_config()
    assert config.app.name == "OneShot Agent Runtime"
    assert config.server.port > 0
    assert config.sandbox.virtual_mode is True
    assert len(config.sandbox.partitions) == 4
    assert len(config.models.providers) >= 3
    mistral = next((p for p in config.models.providers if p.name == "mistral"), None)
    assert mistral is not None
    assert mistral.defaultModel == "mistral-large-latest"
