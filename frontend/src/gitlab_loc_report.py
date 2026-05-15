#!/usr/bin/env python3
"""
gitlab_loc_report.py

Generate Lines of Code (LOC) reports for a GitLab user over a date range,
with pagination, robust error handling, and CSV/Excel export.

Usage (CLI):
    python gitlab_loc_report.py \
        --base-url https://repo.maxlifeinsurance.com/api/v4 \
        --token-env Axismaxlife_p3A_y3Gz3GyNLTyZcJv \
        --user DLBPR02929 \
        --start 2025-12-01 \
        --end 2025-12-27 \
        --membership \
        --out-csv loc_report.csv \
        --out-xlsx loc_report.xlsx
"""

from __future__ import annotations

import os
import sys
import time
import argparse
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from requests import Response
from datetime import datetime, date

try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except Exception:
    PANDAS_AVAILABLE = False


class GitLabAPIError(Exception):
    def __init__(self, message: str, status_code: Optional[int] = None, url: Optional[str] = None, body: Optional[Any] = None):
        super().__init__(message)
        self.status_code = status_code
        self.url = url
        self.body = body


def parse_iso_date_only(ts: str) -> date:
    try:
        return datetime.strptime(ts[:10], "%Y-%m-%d").date()
    except Exception as e:
        raise ValueError(f"Unable to parse date from timestamp: {ts}") from e


def within_range(d: date, start: date, end: date) -> bool:
    return start <= d <= end


@dataclass
class GitLabClientConfig:
    base_url: str
    private_token: str
    timeout_seconds: int = 30
    max_retries: int = 3
    retry_backoff_seconds: float = 1.5


class GitLabClient:
    def __init__(self, config: GitLabClientConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({"PRIVATE-TOKEN": config.private_token})

    def _request(self, method: str, url: str, params: Optional[Dict[str, Any]] = None) -> Response:
        retries = 0
        last_err: Optional[Exception] = None

        while retries <= self.config.max_retries:
            try:
                resp = self.session.request(
                    method=method, url=url, params=params, timeout=self.config.timeout_seconds,
                )
                if resp.status_code in (429, 500, 502, 503, 504):
                    retries += 1
                    time.sleep(self.config.retry_backoff_seconds * retries)
                    continue
                if not (200 <= resp.status_code < 300):
                    try:
                        body = resp.json()
                    except Exception:
                        body = resp.text
                    raise GitLabAPIError(
                        message=f"GitLab API error: {resp.status_code}",
                        status_code=resp.status_code, url=url, body=body,
                    )
                return resp
            except GitLabAPIError:
                raise
            except requests.RequestException as e:
                last_err = e
                retries += 1
                time.sleep(self.config.retry_backoff_seconds * retries)

        raise GitLabAPIError(
            message=f"Request failed after {self.config.max_retries} retries: {last_err}", url=url,
        )

    def _paginate(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Iterable[Dict[str, Any]]:
        url = f"{self.config.base_url.rstrip('/')}/{endpoint.lstrip('/')}"
        page = 1
        per_page = 100

        while True:
            page_params = dict(params or {})
            page_params.update({"page": page, "per_page": per_page})
            resp = self._request("GET", url, params=page_params)
            try:
                data = resp.json()
            except Exception as e:
                raise GitLabAPIError("Failed to parse JSON from response.", status_code=resp.status_code, url=url, body=resp.text) from e

            if not isinstance(data, list):
                if not data:
                    break
                elif isinstance(data, dict) and not data.get("items"):
                    break

            if not data:
                break

            for item in data:
                yield item

            if len(data) < per_page:
                break
            page += 1

    def list_membership_projects(self) -> Iterable[Dict[str, Any]]:
        return self._paginate("projects", params={"membership": True})

    def search_users(self, query: str) -> List[Dict[str, Any]]:
        url = f"{self.config.base_url.rstrip('/')}/users"
        resp = self._request("GET", url, params={"search": query})
        try:
            return resp.json()
        except Exception:
            return []

    def list_project_merge_requests(self, project_id: int, author_id: int, state: str = "merged") -> Iterable[Dict[str, Any]]:
        endpoint = f"projects/{project_id}/merge_requests"
        return self._paginate(endpoint, params={"author_id": author_id, "state": state})

    def get_merge_request_changes(self, project_id: int, mr_iid: int) -> Dict[str, Any]:
        url = f"{self.config.base_url.rstrip('/')}/projects/{project_id}/merge_requests/{mr_iid}/changes"
        resp = self._request("GET", url)
        return resp.json()


@dataclass
class FileLocStats:
    file: str
    added: int
    deleted: int
    modified: int
    net_loc: int


class LocCalculator:
    DIFF_HEADER_PREFIXES = (
        "diff --git", "index ", "--- ", "+++ ", "@@",
        "\\ No newline at end of file", "Binary files ",
    )

    def parse_file_changes(self, changes_payload: Dict[str, Any]) -> List[FileLocStats]:
        results: List[FileLocStats] = []
        for change in changes_payload.get("changes", []):
            file_path = change.get("new_path") or change.get("old_path") or "UNKNOWN"
            diff_text = change.get("diff", "") or ""
            added, deleted, modified = self._count_diff(diff_text)
            net = added + modified - deleted
            results.append(FileLocStats(file=file_path, added=added, deleted=deleted, modified=modified, net_loc=net))
        return results

    def _count_diff(self, diff_text: str) -> Tuple[int, int, int]:
        lines = diff_text.split("\n")
        additions = deletions = modified = 0
        i = 0
        n = len(lines)

        def is_header(line: str) -> bool:
            return any(line.startswith(pfx) for pfx in self.DIFF_HEADER_PREFIXES)

        while i < n:
            line = lines[i]
            if is_header(line) or line.startswith(" ") or line == "":
                i += 1
                continue
            if line.startswith("-") and not line.startswith("---"):
                if i + 1 < n and lines[i + 1].startswith("+") and not lines[i + 1].startswith("+++"):
                    modified += 1
                    i += 2
                    continue
                deletions += 1
                i += 1
                continue
            if line.startswith("+") and not line.startswith("+++"):
                additions += 1
                i += 1
                continue
            i += 1
        return additions, deletions, modified


def generate_loc_report(
    client: GitLabClient, user_identifier: str, start_date: date, end_date: date, membership_only: bool = True,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, int]]:
    users = client.search_users(user_identifier)
    if not users:
        raise GitLabAPIError(f"User not found: {user_identifier}")
    target_user = users[0]
    user_id = int(target_user["id"])

    projects_iter = client.list_membership_projects()

    loc_calc = LocCalculator()
    mr_rows: List[Dict[str, Any]] = []
    file_rows: List[Dict[str, Any]] = []
    grand_added = grand_deleted = grand_modified = grand_net = 0

    for proj in projects_iter:
        project_id = int(proj["id"])
        project_name = proj.get("name") or proj.get("path_with_namespace") or f"Project {project_id}"

        for mr in client.list_project_merge_requests(project_id, author_id=user_id, state="merged"):
            merged_at = mr.get("merged_at")
            if not merged_at:
                continue
            merged_day = parse_iso_date_only(merged_at)
            if not within_range(merged_day, start_date, end_date):
                continue

            mr_iid = int(mr["iid"])
            mr_title = mr.get("title", "")

            changes = client.get_merge_request_changes(project_id, mr_iid)
            file_stats = loc_calc.parse_file_changes(changes)

            total_add = sum(f.added for f in file_stats)
            total_del = sum(f.deleted for f in file_stats)
            total_mod = sum(f.modified for f in file_stats)
            total_net = sum(f.net_loc for f in file_stats)

            grand_added += total_add
            grand_deleted += total_del
            grand_modified += total_mod
            grand_net += total_net

            mr_rows.append({
                "project_id": project_id, "project_name": project_name, "mr_iid": mr_iid,
                "mr_title": mr_title, "merged_at": merged_at,
                "added": total_add, "deleted": total_del, "modified": total_mod, "net_loc": total_net,
            })

            for fs in file_stats:
                file_rows.append({
                    "project_id": project_id, "project_name": project_name, "mr_iid": mr_iid,
                    "file": fs.file, "added": fs.added, "deleted": fs.deleted,
                    "modified": fs.modified, "net_loc": fs.net_loc,
                })

    totals = {
        "total_added": grand_added, "total_deleted": grand_deleted,
        "total_modified": grand_modified, "total_net": grand_net,
    }
    return mr_rows, file_rows, totals


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Generate GitLab LOC report for a user within a date range.")
    p.add_argument("--base-url", required=True)
    p.add_argument("--token")
    p.add_argument("--token-env")
    p.add_argument("--user", required=True)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--membership", action="store_true")
    p.add_argument("--out-csv")
    p.add_argument("--out-xlsx")
    p.add_argument("--timeout", type=int, default=30)
    p.add_argument("--retries", type=int, default=3)
    p.add_argument("--backoff", type=float, default=1.5)
    return p


def main_cli(argv: Optional[List[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    token = args.token or (os.getenv(args.token_env) if args.token_env else None)
    if not token:
        parser.error("Authentication token missing.")

    try:
        start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        end_date = datetime.strptime(args.end, "%Y-%m-%d").date()
    except Exception:
        parser.error("Invalid date format. Use YYYY-MM-DD.")

    if end_date < start_date:
        parser.error("End date must be >= start date.")

    client = GitLabClient(GitLabClientConfig(
        base_url=args.base_url, private_token=token,
        timeout_seconds=args.timeout, max_retries=args.retries, retry_backoff_seconds=args.backoff,
    ))

    try:
        mr_rows, file_rows, totals = generate_loc_report(
            client=client, user_identifier=args.user,
            start_date=start_date, end_date=end_date, membership_only=args.membership,
        )
    except GitLabAPIError as e:
        print(f"Error: {e} (status={e.status_code}, url={e.url})", file=sys.stderr)
        if e.body:
            print(f"Response body: {e.body}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return 3

    print(f"\nMRs found: {len(mr_rows)}")
    print(f"Total Added: {totals['total_added']}")
    print(f"Total Deleted: {totals['total_deleted']}")
    print(f"Total Modified: {totals['total_modified']}")
    print(f"Grand Net LOC: {totals['total_net']}")

    if args.out_csv:
        try:
            import csv
            os.makedirs(os.path.dirname(args.out_csv), exist_ok=True) if os.path.dirname(args.out_csv) else None
            with open(args.out_csv, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["project_id", "project_name", "mr_iid", "mr_title", "merged_at", "added", "deleted", "modified", "net_loc"])
                for r in mr_rows:
                    writer.writerow([r["project_id"], r["project_name"], r["mr_iid"], r["mr_title"], r["merged_at"], r["added"], r["deleted"], r["modified"], r["net_loc"]])
                writer.writerow([])
                writer.writerow(["project_id", "project_name", "mr_iid", "file", "added", "deleted", "modified", "net_loc"])
                for r in file_rows:
                    writer.writerow([r["project_id"], r["project_name"], r["mr_iid"], r["file"], r["added"], r["deleted"], r["modified"], r["net_loc"]])
            print(f"CSV written: {args.out_csv}")
        except Exception as e:
            print(f"Failed to write CSV: {e}", file=sys.stderr)

    if args.out_xlsx:
        if not PANDAS_AVAILABLE:
            print("pandas required for Excel export.", file=sys.stderr)
        else:
            try:
                os.makedirs(os.path.dirname(args.out_xlsx), exist_ok=True) if os.path.dirname(args.out_xlsx) else None
                with pd.ExcelWriter(args.out_xlsx, engine="openpyxl") as writer:
                    pd.DataFrame(mr_rows).to_excel(writer, sheet_name="MR Summary", index=False)
                    pd.DataFrame(file_rows).to_excel(writer, sheet_name="File-wise LOC", index=False)
                print(f"Excel written: {args.out_xlsx}")
            except Exception as e:
                print(f"Failed to write Excel: {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main_cli())
