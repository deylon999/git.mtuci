import glob
import re
from pathlib import Path

ROUTES = Path(__file__).resolve().parent.parent / "app" / "api" / "routes"
DECORATED = re.compile(
    r"@require_(?:any_)?permission\([^)]*\)\s*\n(?:@[^\n]*\n)*async def (\w+)\((.*?)\)\s*(?:->[^:]*)?:",
    re.S,
)


def test_permission_guarded_endpoints_declare_session():
    # require_permission's wrapper keeps the endpoint's signature (functools.wraps), so FastAPI only injects
    # `session` when the endpoint declares it; otherwise the wrapper gets a bare Depends object and fails with 500.
    missing = []
    for path in glob.glob(str(ROUTES / "*.py")):
        source = Path(path).read_text(encoding="utf-8")
        for match in DECORATED.finditer(source):
            if "session" not in match.group(2):
                missing.append(f"{Path(path).name}:{match.group(1)}")
    assert missing == []
