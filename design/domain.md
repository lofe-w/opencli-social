# Publishing Domain

OpenCLI Publisher models each social platform as a separate OpenCLI plugin namespace. A platform plugin owns its authentication model, media upload flow, draft lifecycle, publish submission, and publish-status query.

## Core Terms

| Term | Meaning |
|---|---|
| Platform plugin | One OpenCLI plugin package, such as `publisher-weixin` |
| Command namespace | The OpenCLI `site` name exposed to users |
| Article | A text-rich post, usually HTML for WeChat Official Account |
| Media asset | An uploaded image or video referenced by platform-specific IDs |
| Draft | Remote platform draft that can be reviewed or submitted |
| Publish job | Remote submission from draft/content into platform review or publication |
| Status query | A read command that maps platform status into a stable output row |

## Cross-Platform Rules

1. Official APIs are preferred over UI automation.
2. Write commands require explicit confirmation through `--execute` when they create or submit remote content.
3. Commands should return remote IDs, not just status text.
4. Composite commands may call lower-level helpers but should preserve intermediate IDs in output.
5. Dry-run output must report what would be sent without mutating remote state.

