# Fonts Directory

This directory contains the bundled fonts for the VaultAI plugin.

## Font Files

-   `fonts.css` - CSS file containing @font-face declarations for the Poppins font family
-   The actual font files are embedded as base64 data URLs to ensure they're bundled with the plugin

## Font Weights

-   400 (Regular)
-   500 (Medium)
-   600 (Semi-bold)

## Usage

The fonts are automatically loaded when the plugin is enabled. The CSS file is imported in the main styles.css file.

## Fallback

If the bundled fonts fail to load, the plugin will fall back to system fonts for optimal compatibility.

## License

The Poppins font is licensed under the Open Font License (OFL) and is freely available for use.
