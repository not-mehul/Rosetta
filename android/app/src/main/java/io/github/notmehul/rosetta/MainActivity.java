package io.github.notmehul.rosetta;

import com.getcapacitor.BridgeActivity;

/**
 * Capacitor shell for Rosetta. Documents opened with Rosetta arrive as VIEW
 * intents (AndroidManifest.xml), which the App plugin passes to the page as
 * appUrlOpen (src/platform/intake.ts).
 */
public class MainActivity extends BridgeActivity {}
