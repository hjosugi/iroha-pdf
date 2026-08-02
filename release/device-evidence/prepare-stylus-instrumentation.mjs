import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const buildPath = resolve(root, 'apps/mobile/android/app/build.gradle');
let build = readFileSync(buildPath, 'utf8');

if (!build.includes('testBuildType "release"')) {
  build = build.replace('android {\n', 'android {\n    testBuildType "release"\n');
}
if (!build.includes('testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"')) {
  build = build.replace(
    '    defaultConfig {\n',
    '    defaultConfig {\n        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"\n',
  );
}
if (!build.includes('androidx.test:runner:1.6.2')) {
  build = build.replace(
    'dependencies {\n',
    `dependencies {
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")
`,
  );
}

const testPath = resolve(
  root,
  'apps/mobile/android/app/src/androidTest/java/app/irohapdf/mobile/StylusInputTest.java',
);
const testManifestPath = resolve(
  root,
  'apps/mobile/android/app/src/androidTest/AndroidManifest.xml',
);
mkdirSync(dirname(testPath), { recursive: true });
mkdirSync(dirname(testManifestPath), { recursive: true });
writeFileSync(buildPath, build);
writeFileSync(testManifestPath, `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <!-- Only the generated instrumentation APK is debuggable. The release app
       under test remains non-debuggable; this lets CI retrieve the private
       screenshot and accessibility tree with adb run-as. -->
  <application android:debuggable="true" />
</manifest>
`);
writeFileSync(testPath, `package app.irohapdf.mobile;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.graphics.Rect;
import android.net.Uri;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;

import java.io.File;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class StylusInputTest {
  private static final String DOCUMENT_ID = "device-evidence-large-pdf";

  @Test
  public void pressureCrossesNativePointerBridgeAndPersists() throws Exception {
    Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    Context target = instrumentation.getTargetContext();
    Context testContext = instrumentation.getContext();
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("iroha-pdf:///viewer/" + DOCUMENT_ID));
    intent.setClassName(target, "app.irohapdf.mobile.MainActivity");
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    Activity activity = instrumentation.startActivitySync(intent);
    assertNotNull(activity);

    UiDevice device = UiDevice.getInstance(instrumentation);
    try {
      UiObject2 pen = waitForDescription(device, "Pen annotation tool", "ペン注釈ツール", 60_000);
      assertNotNull("pen tool did not appear", pen);
      assertNotNull(
        "500-page document did not finish loading",
        waitForDescription(device, "Page 1 of 500", "1 / 500ページ", 240_000)
      );
      UiObject2 page = waitForDescription(device, "PDF annotation page", "PDF注釈ページ", 60_000);
      assertNotNull("annotation page did not appear before selecting the pen", page);
      Rect bounds = page.getVisibleBounds();

      pen.click();
      assertNotNull(
        "pen options did not appear",
        waitForDescription(device, "Ink width 2.4", "ペンの太さ 2.4", 30_000)
      );
      instrumentation.waitForIdleSync();

      float startX = bounds.left + bounds.width() * 0.22f;
      float startY = bounds.top + bounds.height() * 0.35f;
      float endX = bounds.left + bounds.width() * 0.72f;
      float endY = bounds.top + bounds.height() * 0.62f;

      long downTime = SystemClock.uptimeMillis();
      dispatchStylus(instrumentation, downTime, downTime, MotionEvent.ACTION_DOWN, startX, startY, 0.18f);
      for (int step = 1; step <= 8; step++) {
        float fraction = step / 8f;
        dispatchStylus(
          instrumentation,
          downTime,
          downTime + step * 16L,
          MotionEvent.ACTION_MOVE,
          startX + (endX - startX) * fraction,
          startY + (endY - startY) * fraction,
          0.18f + 0.72f * fraction
        );
      }
      dispatchStylus(instrumentation, downTime, downTime + 160L, MotionEvent.ACTION_UP, endX, endY, 0f);

      String payload = waitForPressurePayload(target);
      assertNotNull(
        "no pressure-aware ink annotation reached SQLite; " + describeAnnotations(target),
        payload
      );
      JSONArray pressures = new JSONObject(payload).getJSONArray("pressures");
      assertTrue("too few pressure samples", pressures.length() >= 8);
      assertTrue("low pressure sample missing", pressures.getDouble(0) < 0.3);
      assertTrue("high pressure sample missing", pressures.getDouble(pressures.length() - 1) > 0.8);
      System.out.println(
        "Persisted stylus pressures: samples=" + pressures.length()
          + " first=" + pressures.getDouble(0)
          + " last=" + pressures.getDouble(pressures.length() - 1)
      );
      assertNotNull(
        "pressure-aware ink persisted but the visible accessibility state was not updated",
        waitForTextOrDescription(device, "Pressure enabled", "筆圧を反映中", 30_000)
      );
    } finally {
      captureEvidence(device, testContext);
    }
  }

  private static UiObject2 waitForTextOrDescription(
    UiDevice device,
    String english,
    String japanese,
    long timeout
  ) {
    long deadline = SystemClock.uptimeMillis() + timeout;
    while (SystemClock.uptimeMillis() < deadline) {
      UiObject2 object = device.findObject(By.textContains(english));
      if (object == null) object = device.findObject(By.textContains(japanese));
      if (object == null) object = device.findObject(By.descContains(english));
      if (object == null) object = device.findObject(By.descContains(japanese));
      if (object != null) return object;
      SystemClock.sleep(250);
    }
    return null;
  }

  private static UiObject2 waitForDescription(
    UiDevice device,
    String english,
    String japanese,
    long timeout
  ) {
    long deadline = SystemClock.uptimeMillis() + timeout;
    while (SystemClock.uptimeMillis() < deadline) {
      UiObject2 object = device.findObject(By.descContains(english));
      if (object == null) object = device.findObject(By.descContains(japanese));
      if (object != null) return object;
      SystemClock.sleep(250);
    }
    return null;
  }

  private static void dispatchStylus(
    Instrumentation instrumentation,
    long downTime,
    long eventTime,
    int action,
    float x,
    float y,
    float pressure
  ) {
    MotionEvent.PointerProperties properties = new MotionEvent.PointerProperties();
    properties.id = 0;
    properties.toolType = MotionEvent.TOOL_TYPE_STYLUS;
    MotionEvent.PointerCoords coordinates = new MotionEvent.PointerCoords();
    coordinates.x = x;
    coordinates.y = y;
    coordinates.pressure = pressure;
    coordinates.size = 0.02f;
    MotionEvent event = MotionEvent.obtain(
      downTime, eventTime, action, 1,
      new MotionEvent.PointerProperties[] { properties },
      new MotionEvent.PointerCoords[] { coordinates },
      0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_STYLUS, 0
    );
    instrumentation.sendPointerSync(event);
    event.recycle();
    SystemClock.sleep(20);
  }

  private static String describeAnnotations(Context context) {
    File databaseFile = expoDatabaseFile(context);
    if (!databaseFile.exists()) return "database is missing at " + databaseFile;
    try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
      databaseFile.getPath(), null, SQLiteDatabase.OPEN_READONLY
    ); Cursor cursor = database.rawQuery(
      "SELECT payload FROM annotations WHERE document_id = ? ORDER BY updated_at DESC LIMIT 3",
      new String[] { DOCUMENT_ID }
    )) {
      StringBuilder rows = new StringBuilder("recent payloads=");
      while (cursor.moveToNext()) rows.append(cursor.getString(0)).append("; ");
      return rows.toString();
    } catch (Exception error) {
      return "could not inspect annotations: " + error;
    }
  }

  private static String waitForPressurePayload(Context context) throws Exception {
    File databaseFile = expoDatabaseFile(context);
    for (int attempt = 0; attempt < 60; attempt++) {
      if (databaseFile.exists()) {
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(
          databaseFile.getPath(), null, SQLiteDatabase.OPEN_READONLY
        ); Cursor cursor = database.rawQuery(
          "SELECT payload FROM annotations WHERE document_id = ? AND payload LIKE '%\\\"pressures\\\":%' ORDER BY updated_at DESC LIMIT 1",
          new String[] { DOCUMENT_ID }
        )) {
          if (cursor.moveToFirst()) return cursor.getString(0);
        }
      }
      SystemClock.sleep(500);
    }
    return null;
  }

  private static File expoDatabaseFile(Context context) {
    // expo-sqlite's Android defaultDatabaseDirectory is
    // context.filesDir/SQLite, not Context#getDatabasePath().
    return new File(new File(context.getFilesDir(), "SQLite"), "iroha-pdf.db");
  }

  private static void captureEvidence(UiDevice device, Context context) {
    try {
      File directory = new File(context.getFilesDir(), "device-evidence");
      if (!directory.exists() && !directory.mkdirs()) {
        throw new IllegalStateException("could not create stylus evidence directory");
      }
      if (!device.takeScreenshot(new File(directory, "stylus-pressure.png"))) {
        throw new IllegalStateException("could not capture stylus evidence screenshot");
      }
      device.dumpWindowHierarchy(new File(directory, "stylus-window.xml"));
    } catch (Exception error) {
      System.err.println("Could not capture in-app stylus evidence: " + error);
    }
  }
}
`);

process.stdout.write('Prepared release-variant stylus instrumentation.\n');
