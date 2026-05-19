from __future__ import annotations

from ai_job_analyze.report import ReportDraft, ReportRequest, SourceFailure


def test_report_draft_serializes_request_and_failures() -> None:
    draft = ReportDraft(
        request=ReportRequest(
            companies=["bytedance"],
            channel="social",
            query="AI 产品经理",
            analysis_question="社招更看重什么？",
        ),
        failures=[
            SourceFailure(
                company="bytedance",
                channel="social",
                url="https://example.com/jobs",
                stage="discovery",
                reason="captcha required",
            )
        ],
    )

    payload = draft.to_dict()

    assert payload["request"]["companies"] == ["bytedance"]
    assert payload["request"]["output"] == "html"
    assert payload["failures"][0]["stage"] == "discovery"
