package com.alekpeed.perfectear;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Targeting API 35 makes Android draw the app edge-to-edge by default —
    // content extends under the status bar and gesture nav bar unless the
    // app opts out. This app has no use for that; it just needs the screen
    // space the system bars aren't using, laid out the normal way.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
