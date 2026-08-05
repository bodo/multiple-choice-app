# Exercise content

This package boundary is reserved for versioned JSON import packages and shared
content validation during the SQL migration.

The transition runtime files remain in `apps/frontend/public/data` until the
public API cutover. SQL then becomes the productive exercise authority; JSON
remains an import or interchange format rather than a second runtime source.
