from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass(frozen=True)
class ReportRequest:
    companies: list[str]
    channel: str
    query: str
    output: str = "html"
    analysis_question: str = ""


@dataclass(frozen=True)
class SourceFailure:
    company: str
    channel: str
    url: str
    stage: str
    reason: str


@dataclass(frozen=True)
class ReportDraft:
    request: ReportRequest
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat(timespec="seconds"))
    failures: list[SourceFailure] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "request": {
                "companies": self.request.companies,
                "channel": self.request.channel,
                "query": self.request.query,
                "output": self.request.output,
                "analysis_question": self.request.analysis_question,
            },
            "created_at": self.created_at,
            "failures": [failure.__dict__ for failure in self.failures],
        }
