<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<xsl:output method="html" indent="yes" encoding="UTF-8" doctype-system="about:legacy-compat"/>
<xsl:template match="/">
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Scale42 — Sitemap</title>
<style>
  body { font-family: 'Commissioner', system-ui, sans-serif; margin: 0; padding: 32px; background: #f8fafb; color: #1c2e3f; }
  .wrap { max-width: 1100px; margin: 0 auto; }
  h1 { font-family: 'Lexend', sans-serif; margin: 0 0 8px; letter-spacing: -0.02em; }
  p.meta { color: #5a6b78; margin: 0 0 24px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e3e6e8; border-radius: 8px; overflow: hidden; }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #e3e6e8; font-size: 14px; }
  th { background: #fafbfc; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #5a6b78; font-weight: 600; }
  tr:last-child td { border-bottom: none; }
  td.lastmod { color: #5a6b78; font-size: 12.5px; white-space: nowrap; }
  a { color: #2f6675; text-decoration: none; }
  a:hover { color: #1c2e3f; }
</style>
</head>
<body>
<div class="wrap">
<h1>Scale42 sitemap</h1>
<p class="meta">
  <xsl:value-of select="count(s:urlset/s:url)"/> URLs ·
  <a href="/">Home</a>
</p>
<table>
  <thead><tr><th>URL</th><th>Last modified</th></tr></thead>
  <tbody>
  <xsl:for-each select="s:urlset/s:url">
    <tr>
      <td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
      <td class="lastmod"><xsl:value-of select="s:lastmod"/></td>
    </tr>
  </xsl:for-each>
  </tbody>
</table>
</div>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
