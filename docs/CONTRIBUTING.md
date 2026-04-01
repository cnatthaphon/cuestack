# Contributing Guide

## Branch Strategy

```
feature/xxx → staging → main
```

- **main** — production, protected, requires MR approval
- **staging** — integration testing, CI must pass
- **feature/xxx** — one branch per feature/block

## Workflow: Design First, Code Second

### Step 1: Design Doc

Before writing code, create a design doc from the template:

```bash
git checkout staging
git checkout -b feature/my-block
cp docs/designs/TEMPLATE.md docs/designs/my-block.md
# Fill in: What, How, API, Tests, Security
git add docs/designs/my-block.md
git commit -m "docs: design doc for MyBlock"
git push -u origin feature/my-block
# Create MR with label "Design Review"
```

### Step 2: Design Approval

- Reviewer checks: scope, API design, security section, test plan
- Approved → proceed to code
- Changes requested → update design first

### Step 3: Code

After design is approved:

- Implement block in `backend/blocks/`
- Write tests in `backend/tests/`
- Update `docs/BLOCKS.md`
- Push to same branch

### Step 4: MR to Staging

- CI runs: lint → test → docker build
- Code review
- Merge to staging

### Step 5: Staging → Main

After all Sprint features are on staging and tested together.

## Adding a New Block

### File Structure
```
backend/blocks/my_block.py       — implementation
backend/tests/test_my_block.py   — tests
docs/designs/my-block.md         — design doc
```

### Block Template
```python
from blocks.base import Block, PipelineContext

class MyBlock(Block):
    name = "MyBlock"

    async def execute(self, ctx: PipelineContext) -> PipelineContext:
        # Read from ctx
        # Process
        # Write to ctx
        return ctx
```

### Test Template
```python
import pytest
from blocks.base import PipelineContext
from blocks.my_block import MyBlock

@pytest.mark.asyncio
async def test_basic():
    block = MyBlock()
    ctx = PipelineContext(raw_data={"test": True})
    ctx = await block.execute(ctx)
    assert ctx.ok
```

## Code Style

- Python: type hints, follow existing patterns
- JavaScript: React functional components, no class components
- Blocks are independent — never import another block
- Every block testable in isolation (no DB required for unit tests)

## Commit Messages

```
docs: design doc for AlertBlock
feat: add AlertBlock with threshold monitoring
test: add AlertBlock unit tests
fix: ValidateBlock rejects NaN values
```
