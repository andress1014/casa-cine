package com.andress1014.casacine.tv;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import java.io.File;
import java.nio.file.Files;
import java.security.MessageDigest;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={23,28,35})
public class TvUpdaterTest {
    private final Signature trusted = new Signature("00112233");
    private final Signature other = new Signature("44556677");
    private TvUpdater updater;
    private PackageManager packages;
    private PackageInfo archive, installed;
    private File file;
    private TvUpdate update;

    @Before public void prepare() throws Exception {
        file = File.createTempFile("guarida-validation-",".apk");
        byte[] bytes = new byte[1024]; bytes[0] = 42; Files.write(file.toPath(),bytes);
        JSONObject manifest = new JSONObject().put("packageName",BuildConfig.APPLICATION_ID)
            .put("versionCode",BuildConfig.VERSION_CODE+1).put("versionName","99.0.0")
            .put("minSdk",23).put("apkName","Guarida-TV-v99.0.0.apk").put("size",bytes.length)
            .put("sha256",TvUpdater.hex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        update = new TvUpdate(manifest,GitHubReleases.DOWNLOADS+"test/Guarida-TV-v99.0.0.apk");
        archive = new PackageInfo(); archive.packageName=BuildConfig.APPLICATION_ID;
        archive.versionName="99.0.0"; archive.versionCode=BuildConfig.VERSION_CODE+1;
        archive.applicationInfo=new ApplicationInfo();
        if (Build.VERSION.SDK_INT>=24) archive.applicationInfo.minSdkVersion=23;
        archive.signatures=new Signature[]{trusted};
        installed=new PackageInfo(); installed.signatures=new Signature[]{trusted};
        packages=mock(PackageManager.class);
        when(packages.getPackageArchiveInfo(eq(file.getAbsolutePath()),anyInt())).thenReturn(archive);
        when(packages.getPackageInfo(eq(BuildConfig.APPLICATION_ID),anyInt())).thenReturn(installed);
        Activity activity=mock(Activity.class); when(activity.getPackageManager()).thenReturn(packages);
        updater=new TvUpdater(activity);
    }
    @After public void cleanup() {
        if (updater!=null) updater.close();
        if (file!=null) file.delete();
    }
    @Test public void acceptsVerifiedLegacyCertificatesWhenSigningInfoIsAbsent() throws Exception {
        updater.validate(file,update);
        int flags=PackageManager.GET_SIGNATURES|(Build.VERSION.SDK_INT>=28 ? PackageManager.GET_SIGNING_CERTIFICATES : 0);
        verify(packages).getPackageArchiveInfo(file.getAbsolutePath(),flags);
        verify(packages).getPackageInfo(BuildConfig.APPLICATION_ID,flags);
    }
    @Test public void rejectsDifferentCertificate() throws Exception {
        archive.signatures=new Signature[]{other};
        assertFailure("V08");
    }
    @Test public void rejectsMissingDownloadedCertificate() throws Exception {
        archive.signatures=null;
        assertFailure("V07");
    }
    @Test public void rejectsCorruptDownloadBeforeReadingPackage() throws Exception {
        byte[] changed=Files.readAllBytes(file.toPath()); changed[0]=0; Files.write(file.toPath(),changed);
        assertFailure("V02");
        verifyNoInteractions(packages);
    }
    @Test public void rejectsWrongPackage() throws Exception {
        archive.packageName="com.example.other";
        assertFailure("V04");
    }
    @Test @Config(sdk={28,35}) public void currentSigningInfoTakesPriorityOverLegacyCertificate() throws Exception {
        SigningInfo current=mock(SigningInfo.class); when(current.getApkContentsSigners()).thenReturn(new Signature[]{other});
        archive.signingInfo=current;
        assertFailure("V08");
    }
    private void assertFailure(String code) throws Exception {
        try { updater.validate(file,update); fail("Expected validation rejection "+code); }
        catch (TvUpdater.ValidationFailure failure) { assertTrue(failure.getMessage(),failure.getMessage().contains(code)); }
    }
}
