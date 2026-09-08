package com.mli.groupupsure.util;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.X509v3CertificateBuilder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

import java.io.ByteArrayInputStream;
import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.Date;

/**
 * Standalone utility to generate an RSA key pair whenever a new one is needed.
 *
 * <p>The output matches exactly what {@link DecryptionUtil} expects:
 * <ul>
 * <li><b>Private key</b> - Base64 encoded PKCS#8 (used for signing / unwrapping).</li>
 * <li><b>Public key</b> - Base64 encoded X.509 self-signed certificate (used for
 * key wrapping / signature verification).</li>
 * </ul>
 *
 * <p>Run {@link #main(String[])} to print a fresh key pair. Copy the values into your
 * properties / SSM (or into {@code DecryptionUtil.main} for local testing) whenever the
 * keys need to be rotated.
 */
public class KeyPairGeneratorUtil {

    private static final String ALGO_RSA = "RSA";
    private static final int KEY_SIZE = 2048;
    private static final String SIGNATURE_ALGO = "SHA256withRSA";
    private static final String CERT_TYPE = "X.509";
    private static final long ONE_YEAR_MILLIS = 365L * 24L * 60L * 60L * 1000L;
    private static final int VALIDITY_YEARS = 2;

    /**
     * Generates a fresh RSA key pair.
     *
     * @return the generated {@link KeyPair}
     */
    public static KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance(ALGO_RSA);
        generator.initialize(KEY_SIZE, new SecureRandom());
        return generator.generateKeyPair();
    }

    /**
     * Returns the Base64 encoded PKCS#8 private key string, ready to paste into
     * {@code DecryptionUtil} / properties.
     */
    public static String getBase64PrivateKey(PrivateKey privateKey) {
        return Base64.getEncoder().encodeToString(privateKey.getEncoded());
    }

    /**
     * Builds a self-signed X.509 certificate for the given key pair and returns it
     * as a Base64 encoded string (no PEM header/footer), matching the format
     * {@code DecryptionUtil#getPublicKey} reads.
     *
     * @param keyPair    the key pair to certify
     * @param commonName the CN to embed, e.g. {@code "SOA-PMJJBY"}
     */
    public static String getBase64PublicKeyCertificate(KeyPair keyPair, String commonName) throws Exception {
        X509Certificate certificate = buildSelfSignedCertificate(keyPair, commonName);
        return Base64.getEncoder().encodeToString(certificate.getEncoded());
    }

    private static X509Certificate buildSelfSignedCertificate(KeyPair keyPair, String commonName) throws Exception {
        X500Name subject = new X500Name("CN=" + commonName + ", O=MaxLife, C=IN");

        Date notBefore = new Date();
        Date notAfter = new Date(notBefore.getTime() + VALIDITY_YEARS * ONE_YEAR_MILLIS);

        BigInteger serial = new BigInteger(64, new SecureRandom());

        X509v3CertificateBuilder certBuilder = new X509v3CertificateBuilder(
                subject,                               // issuer (self-signed => same as subject)
                serial,
                notBefore,
                notAfter,
                subject,                               // subject
                org.bouncycastle.asn1.x509.SubjectPublicKeyInfo.getInstance(
                        keyPair.getPublic().getEncoded()));

        ContentSigner signer = new JcaContentSignerBuilder(SIGNATURE_ALGO).build(keyPair.getPrivate());
        X509CertificateHolder holder = certBuilder.build(signer);

        return new JcaX509CertificateConverter().getCertificate(holder);
    }

    /**
     * Convenience: generate a pair and print both values in the exact format used by
     * {@code DecryptionUtil}. Verifies the printed values round-trip through the JDK.
     */
    public static void main(String[] args) throws Exception {
        String commonName = args.length > 0 ? args[0] : "SOA-PMJJBY";

        KeyPair keyPair = generateKeyPair();

        String privateKeyB64 = getBase64PrivateKey(keyPair.getPrivate());
        String publicKeyCertB64 = getBase64PublicKeyCertificate(keyPair, commonName);

        System.out.println("---- PRIVATE KEY (Base64 PKCS#8) ----");
        System.out.println(privateKeyB64);
        System.out.println();
        System.out.println("---- PUBLIC KEY (Base64 X.509 certificate) ----");
        System.out.println(publicKeyCertB64);

        // Sanity check that the printed keys can be re-loaded the same way DecryptionUtil does.
        verify(privateKeyB64, publicKeyCertB64);
    }

    private static void verify(String privateKeyB64, String publicKeyCertB64) throws Exception {
        KeyFactory keyFactory = KeyFactory.getInstance(ALGO_RSA);
        PrivateKey reloadedPrivate = keyFactory.generatePrivate(
                new PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKeyB64)));

        CertificateFactory certFactory = CertificateFactory.getInstance(CERT_TYPE);
        Certificate certificate = certFactory.generateCertificate(
                new ByteArrayInputStream(Base64.getDecoder().decode(publicKeyCertB64)));
        PublicKey reloadedPublic = certificate.getPublicKey();

        System.out.println();
        System.out.println("Reloaded private key algorithm: " + reloadedPrivate.getAlgorithm());
        System.out.println("Reloaded public key algorithm : " + reloadedPublic.getAlgorithm());
        System.out.println("Keys reloaded successfully - safe to use with DecryptionUtil.");
    }
}
