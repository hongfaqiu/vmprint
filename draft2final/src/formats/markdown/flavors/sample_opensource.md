# VMPrint OpenSource Flavor Sample
:: Publication-grade documents for open-source repositories, generated from plain Markdown.

This sample demonstrates the `opensource` markdown flavor tuned for open-source documentation and README-style technical narratives, including footnote-style links like [VMPrint docs](https://example.com/docs).

![Release architecture plate](./sample_image.jpg "Architecture frame")
> Figure 1. Event pipeline and layout/render separation in the VMPrint execution path.

## Design Notes

- Figure captions can be authored naturally using a blockquote directly under the image.
- Images are framed by flavor policy for visual consistency in open-source publication exports.
- Hyperlinks are rendered as footnote markers and emitted in a Footnotes section.

### Example

```ts
export const releaseTag = (version: string): string => `vmprint-${version}`;
```
