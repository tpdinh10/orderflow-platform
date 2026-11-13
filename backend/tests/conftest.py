import pytest
from app.main import app
from app.auth import get_current_user, require_admin
from app.models import User

@pytest.fixture(autouse=True)
def bypass_auth_for_existing_api_tests(request):
    if request.node.get_closest_marker("real_auth"):
        yield
        return
    admin = User(id=-1, email="test-admin@example.com", role="admin", is_active=True, hashed_password="unused")
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[require_admin] = lambda: admin
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_admin, None)
