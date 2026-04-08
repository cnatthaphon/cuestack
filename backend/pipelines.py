"""
Pipeline definitions — wires blocks together.

INGEST:  Validate → Transform → Store
QUERY:   Query → Aggregate → Format(json)
SUMMARY: Query → Aggregate → Format(summary)
EXPORT:  Query → Aggregate → Format(csv)
"""

from blocks import (
    AggregateBlock,
    FormatBlock,
    Pipeline,
    QueryBlock,
    StoreBlock,
    TransformBlock,
    ValidateBlock,
)


def create_ingest_pipeline(db_pool=None):
    return Pipeline("ingest", [
        ValidateBlock(),
        TransformBlock(),
        StoreBlock(),
    ])


def create_query_pipeline(db_pool=None):
    return Pipeline("query", [
        QueryBlock(),
        AggregateBlock(),
        FormatBlock("json"),
    ])


def create_summary_pipeline(db_pool=None):
    return Pipeline("summary", [
        QueryBlock(),
        AggregateBlock(["avg", "min", "max", "count", "sum"]),
        FormatBlock("summary"),
    ])


def create_export_pipeline(db_pool=None):
    return Pipeline("export", [
        QueryBlock(),
        AggregateBlock(),
        FormatBlock("csv"),
    ])
