package com.mli.groupupsure.util;

import com.mli.groupupsure.exception.GenericCustomException;
import jakarta.xml.bind.DatatypeConverter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;

@Slf4j
@Component
public class DecryptionUtil {

    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int IV_LENGTH = 16;
    private static final int DYNAMIC_KEY_LENGTH = 32;
    private static final String AES_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String RSA_TRANSFORMATION = "RSA/ECB/OAEPPadding";
    private static final String ALGO_AES = "AES";
    private static final String ALGO_RSA = "RSA";
    private static final String SIGNATURE_ALGO = "SHA256withRSA";
    private static final String CERT_TYPE = "X.509";
    private static final String SEPARATOR = ":";
    private static final String KEY_LIST_SEPARATOR = ";";
    private static final int PART_COUNT = 3;
    private static final String ENCRYPT_ERROR = "Unable to encrypt the PMJJBY request payload";
    private static final String DECRYPT_ERROR = "Unable to decrypt the PMJJBY response payload";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /**
     * Encrypts a plaintext payload for a partner, selecting the private/public key
     * pair that corresponds to the given appId.
     *
     * <p>The caller (serviceimpl) sources three parallel semicolon-separated lists
     * from properties/SSM, e.g.
     * <pre>
     * enrollment.appid=appid1;appid2
     * enrollment.privatekey=key1;key2
     * enrollment.publickey=key1;key2
     * </pre>
     * The position of appId in appIdList selects the private key at the
     * same position in senderPrivateKeyList and the public key at the same
     * position in receiverPublicKeyList.
     */
    public static String encrypt(String plainText, String appId, String appIdList, String senderPrivateKeyList,
                                 String receiverPublicKeyList) throws GenericCustomException {
        int keyIndex = resolveKeyIndex(appId, appIdList, ENCRYPT_ERROR);
        String senderPrivateKey = resolveKey(senderPrivateKeyList, keyIndex, ENCRYPT_ERROR);
        String receiverPublicKeyCert = resolveKey(receiverPublicKeyList, keyIndex, ENCRYPT_ERROR);
        return encrypt(plainText, senderPrivateKey, receiverPublicKeyCert);
    }

    /**
     * Decrypts a partner payload, selecting the private/public key pair that
     * corresponds to the given appId
     * (see encrypt with appId overload).
     */
    public static String decrypt(String encText, String appId, String appIdList, String receiverPrivateKeyList,
                                 String senderPublicKeyList) throws GenericCustomException {
        int keyIndex = resolveKeyIndex(appId, appIdList, DECRYPT_ERROR);
        String receiverPrivateKey = resolveKey(receiverPrivateKeyList, keyIndex, DECRYPT_ERROR);
        String senderPublicKeyCert = resolveKey(senderPublicKeyList, keyIndex, DECRYPT_ERROR);
        return decrypt(encText, receiverPrivateKey, senderPublicKeyCert);
    }

    /**
     * Encrypts a plaintext payload for a partner.
     *
     * @param plainText             the request payload to encrypt
     * @param senderPrivateKey      Base64 PKCS8 private key of this service (for signing)
     * @param receiverPublicKeyCert PEM/Base64 X.509 certificate of the partner (for key wrapping)
     * @return Base64-encoded wrappedKey:encryptedBody:signature
     */
    public static String encrypt(String plainText, String senderPrivateKey, String receiverPublicKeyCert)
            throws GenericCustomException {
        try {
            byte[] dynamicKey = new byte[DYNAMIC_KEY_LENGTH];
            SECURE_RANDOM.nextBytes(dynamicKey);

            byte[] iv = getIv(dynamicKey);
            byte[] encryptedBody = encryptAesGcm(plainText.getBytes(StandardCharsets.UTF_8), dynamicKey, iv);

            String encryptedBodyB64 = Base64.getEncoder().encodeToString(encryptedBody);
            String signature = sign(encryptedBodyB64, senderPrivateKey);
            String wrappedKey = wrapDynamicKey(dynamicKey, receiverPublicKeyCert);

            String combined = wrappedKey + SEPARATOR + encryptedBodyB64 + SEPARATOR + signature;
            return Base64.getEncoder().encodeToString(combined.getBytes(StandardCharsets.UTF_8));
        } catch (GenericCustomException e) {
            throw e;
        } catch (Exception e) {
            log.error("PMJJBY encryption failed", e);
            throw new GenericCustomException(ENCRYPT_ERROR);
        }
    }

    /**
     * Decrypts a partner payload after verifying its digital signature.
     *
     * @param encText             Base64-encoded wrappedKey:encryptedBody:signature
     * @param receiverPrivateKey  Base64 PKCS8 private key of this service (to unwrap dynamic key)
     * @param senderPublicKeyCert PEM/Base64 X.509 certificate of the partner (to verify signature)
     * @return decrypted plaintext payload
     */
    public static String decrypt(String encText, String receiverPrivateKey, String senderPublicKeyCert)
            throws GenericCustomException {
        try {
            String decoded = new String(Base64.getDecoder().decode(encText), StandardCharsets.UTF_8);
            String[] parts = decoded.split(SEPARATOR);
            if (parts.length != PART_COUNT) {
                log.error("PMJJBY payload has unexpected segment count: {}", parts.length);
                throw new GenericCustomException(DECRYPT_ERROR);
            }

            String wrappedKey = parts[0];
            String encryptedBodyB64 = parts[1];
            String signature = parts[2];

            if (!verify(encryptedBodyB64, signature, senderPublicKeyCert)) {
                log.error("PMJJBY digital signature verification failed");
                throw new GenericCustomException(DECRYPT_ERROR);
            }

            byte[] dynamicKey = unwrapDynamicKey(wrappedKey, receiverPrivateKey);
            byte[] iv = getIv(dynamicKey);
            byte[] decrypted = decryptAesGcm(Base64.getDecoder().decode(encryptedBodyB64), dynamicKey, iv);

            return new String(decrypted, StandardCharsets.UTF_8);
        } catch (GenericCustomException e) {
            throw e;
        } catch (Exception e) {
            log.error("PMJJBY decryption failed", e);
            throw new GenericCustomException(DECRYPT_ERROR);
        }
    }

    private static byte[] getIv(byte[] dynamicKey) {
        return Arrays.copyOfRange(dynamicKey, 0, IV_LENGTH);
    }

    private static byte[] encryptAesGcm(byte[] plainText, byte[] key, byte[] iv) throws GenericCustomException {
        try {
            Cipher cipher = Cipher.getInstance(AES_TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, ALGO_AES),
                    new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            return cipher.doFinal(plainText);
        } catch (Exception e) {
            log.error("AES-GCM encryption failed", e);
            throw new GenericCustomException(ENCRYPT_ERROR);
        }
    }

    private static byte[] decryptAesGcm(byte[] cipherText, byte[] key, byte[] iv) throws GenericCustomException {
        try {
            Cipher cipher = Cipher.getInstance(AES_TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, ALGO_AES),
                    new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            return cipher.doFinal(cipherText);
        } catch (Exception e) {
            log.error("AES-GCM decryption failed", e);
            throw new GenericCustomException(DECRYPT_ERROR);
        }
    }

    private static String wrapDynamicKey(byte[] dynamicKey, String publicKeyCert) throws GenericCustomException {
        try {
            Cipher cipher = Cipher.getInstance(RSA_TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getPublicKey(publicKeyCert));
            return Base64.getEncoder().encodeToString(cipher.doFinal(dynamicKey));
        } catch (Exception e) {
            log.error("RSA dynamic key wrap failed", e);
            throw new GenericCustomException(ENCRYPT_ERROR);
        }
    }

    private static byte[] unwrapDynamicKey(String wrappedKey, String privateKeyStr) throws GenericCustomException {
        try {
            Cipher cipher = Cipher.getInstance(RSA_TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, getPrivateKey(privateKeyStr));
            return cipher.doFinal(Base64.getDecoder().decode(wrappedKey));
        } catch (Exception e) {
            log.error("RSA dynamic key unwrap failed", e);
            throw new GenericCustomException(DECRYPT_ERROR);
        }
    }

    private static String sign(String data, String privateKeyStr) throws GenericCustomException {
        try {
            Signature signature = Signature.getInstance(SIGNATURE_ALGO);
            signature.initSign(getPrivateKey(privateKeyStr));
            signature.update(data.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(signature.sign());
        } catch (Exception e) {
            log.error("SHA256withRSA signing failed", e);
            throw new GenericCustomException(ENCRYPT_ERROR);
        }
    }

    private static boolean verify(String data, String digitalSignature, String publicKeyCert)
            throws GenericCustomException {
        try {
            Signature signature = Signature.getInstance(SIGNATURE_ALGO);
            signature.initVerify(getPublicKey(publicKeyCert));
            signature.update(data.getBytes(StandardCharsets.UTF_8));
            return signature.verify(Base64.getDecoder().decode(digitalSignature));
        } catch (Exception e) {
            log.error("SHA256withRSA verification failed", e);
            throw new GenericCustomException(DECRYPT_ERROR);
        }
    }

    private static PrivateKey getPrivateKey(String privateKeyStr) throws GenericCustomException {
        try {
            byte[] encoded = Base64.getDecoder().decode(sanitizeKey(privateKeyStr));
            PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(encoded);
            return KeyFactory.getInstance(ALGO_RSA).generatePrivate(keySpec);
        } catch (Exception e) {
            log.error("Failed to load RSA private key", e);
            throw new GenericCustomException(DECRYPT_ERROR);
        }
    }

    private static PublicKey getPublicKey(String publicKeyCert) throws GenericCustomException {
        try {
            CertificateFactory certificateFactory = CertificateFactory.getInstance(CERT_TYPE);
            StringBuilder keyBuffer = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new StringReader(publicKeyCert))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.startsWith("-")) {
                        keyBuffer.append(line);
                    }
                }
            }
            byte[] certBytes = Base64.getDecoder().decode(keyBuffer.toString());
            Certificate certificate = certificateFactory.generateCertificate(new ByteArrayInputStream(certBytes));
            return certificate.getPublicKey();
        } catch (Exception e) {
            log.error("Failed to load RSA public key from certificate", e);
            throw new GenericCustomException(ENCRYPT_ERROR);
        }
    }

    private static String sanitizeKey(String key) {
        return key.replace("\n", "").replace("\r", "").trim();
    }

    private static int resolveKeyIndex(String appId, String appIdList, String errorMessage)
            throws GenericCustomException {
        if (appId == null || appId.trim().isEmpty()) {
            log.error("PMJJBY appId is empty");
            throw new GenericCustomException(errorMessage);
        }
        if (appIdList == null || appIdList.trim().isEmpty()) {
            log.error("PMJJBY appId list is empty");
            throw new GenericCustomException(errorMessage);
        }
        String[] appIds = appIdList.split(KEY_LIST_SEPARATOR);
        String target = appId.trim();
        for (int i = 0; i < appIds.length; i++) {
            if (target.equals(appIds[i].trim())) {
                return i;
            }
        }
        log.error("PMJJBY appId not configured: {}", target);
        throw new GenericCustomException(errorMessage);
    }

    private static String resolveKey(String keyList, int keyIndex, String errorMessage) throws GenericCustomException {
        if (keyList == null || keyList.trim().isEmpty()) {
            log.error("PMJJBY key list is empty");
            throw new GenericCustomException(errorMessage);
        }
        if (keyIndex < 0) {
            log.error("PMJJBY key index is negative: {}", keyIndex);
            throw new GenericCustomException(errorMessage);
        }
        String[] keys = keyList.split(KEY_LIST_SEPARATOR);
        if (keyIndex >= keys.length || keys[keyIndex] == null || keys[keyIndex].trim().isEmpty()) {
            log.error("PMJJBY key not found at index: {} (available: {})", keyIndex, keys.length);
            throw new GenericCustomException(errorMessage);
        }
        return keys[keyIndex].trim();
    }

    public static void main(String[] args) throws InvalidAlgorithmParameterException, NoSuchPaddingException,
            IllegalBlockSizeException, NoSuchAlgorithmException, BadPaddingException, SignatureException,
            InvalidKeySpecException, InvalidKeyException, GenericCustomException {

        String soaPrivateKey = "MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCmxvS8kk8feClj3QCc/ebDjFNA/+bFwAiCe8Rvtnmht/5OACWVmVJ10q/HwDgGFFn7WQDm56WOEUo3FeqYFAu3PPiTPMOXgJUqYP6KWCPzQSE4aVahf9qjgldbLxpsiid2KzX0RnFWzqQtT5LgLdNoI9RA0bs1LoZjX8lS/YUOngwz2g+gdtlvtQXsDruezg1FFlIf6QOfg/mZP8YdTirYMOgZhv77M1nGfFs3Ly5VcdR+mQqg4/mw0O4+oZUKc70I4Ni8S3Cv9+9aZ5chCvgz9guszJi8s0nfZloQN2SZyh4bPwxqRxoHRPfZdxSBlwEw92RX4UzKnDxooGyUeWqNAgMBAAECggEAIJdKpjsVOTobJIfAoe1AFkCq2E3pxAUl5JHZLleDZ2X0TTvcHGLs6Vd1wFxA1ndNqj+XXIgyIxQf46nlwThRncpNbUB3nHilLbXsqA5XYCb/He3/3umESWWkOo525HUPBxmknorRhTw2eyBMvIBYCsbNqKkTo23nFy5VwmEGindpeL4hfZIbVv2OOIYxsy8Q7Q9KThBp58XNlNCoLtUjau0eVBh8ut8uODEzDbn9v5y11aVmzv3CtV6s5QVfgiIqxZBpkJlPJUm/00CVSR5e4n6lKupSrqMkistTPi9HL/E44pzS0f/MLF5K/Pd6S3iNd1PkcjNZjsQ2FhZQd1W0IQKBgQDRspX6ZWfrB5oClnR/Z0xKITNu2NbdJ+HY1bCBvRWr77GoZaYjf9093wLaJTV3QthfKYM9/fe76zyQUjbidVN8laqG0u/vFsiX1cesLZKp2PHhPOweDIb809uN/4raoCZmIMzEexyoP8i8SF5zTIlEA78FaFgB9pFZXhb11bTe1QKBgQDLmj2Ael8rT7iQCS0M6kYXuz07KZe3w54aZSBjROjBHFaGqNka5mEuXdyLi8SYPMmF6onoIi6NENnInHmjimX5u+3Bz2Tn/Y1ZIxwefSQ7Y3slv5VeTfNEwDncU3ePfNwNIpH+t8OEbPxGiRx7fShEBnlmWYrbNP5/ITyOChpo2QKBgQDRspX6ZWfrB5oClnR/Z0xKITNu2NbdJ+HY1bCBvRWr77GoZaYjf9093wLaJTV3QthfKYM9/fe76zyQUjbidVN8laqG0u/vFsiX1cesLZKp2PHhPOweDIb809uN/4raoCZmIMzEexyoP8i8SF5zTIlEA78FaFgB9pFZXhb11bTe1QKBgQDLmj2Ael8rT7iQCS0M6kYXuz07KZe3w54aZSBjROjBHFaGqNka5mEuXdyLi8SYPMmF6onoIi6NENnInHmjimX5u+3Bz2Tn/Y1ZIxwefSQ7Y3slv5VeTfNEwDncU3ePfNwNIpH+t8OEbPxGiRx7fShEBnlmWYrbNP5/ITyOChpo2QKBgQDKA+G4eDjEk24rUAarNjiosZN7Firoo6NP4Y1Jb3+RRDlCoaqMSII7OLzmqzH20s7f3n4xGpmuz9BouMtnHuBvBUBi4pODIc/ddnYFyWGhfv6GnspZqHfi2baJ9cUvGVnkyXR7VJ8m90vLF2zmZrVWcMV10C/4tDEShzJXYqn8gQKBgQDGXI1S4OZboh3kZqw3iv+jG076lvkzligw+xlk3bwOeHdsVpC+fnlr3RKD+jYdRAvqpqiZOsQzt5kWtCxmQu47Mvbe/hoHU6Ykk+pPYgisu609B7yU1kkOUGGO4Nr5NuKFAYtPqOWZ3Tyj0+2l+jgCnnQkXVTFYIoafd0rXXiBcQKBgEDpM4JOYtv4ylYXErsBa29imzAvALryyFyg0IVBgY4Q6Xx/h2f2w0iezxcaB+gx00Oyqjo/hn9X5Sxd+XQTyf0FObkMtMZnA3GD8G8CK+3TInLm9QxF9KXmu4aMZKHIYkXoXI648pmiKzftIsMLTUX41j907oGeSEy4VYrlK1a+";

        String pmjjbyPublicKey = "MIIC6TCCAdGgAwIBAgIJAMwlTtuoNrd2MA0GCSqGSIb3DQEBCwUAMDQxEzARBgNVBAMMClNPQS1QTUpKQlkxEDAOBgNVBAoMB01heExpZmUxCzAJBgNVBAYTAklOMB4XDTI2MDkwODEwMTYzMFoXDTI4MDkwNzEwMTYzMFowNDETMBEGA1UEAwwKU09BLVBNSkpCWTEQMA4GA1UECgwHTWF4TGlmZTELMAkGA1UEBhMCSU4wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCmxvS8kk8feClj3QCc/ebDjFNA/+bFwAiCe8Rvtnmht/5OACWVmVJ10q/HwDgGFFn7WQDm56WOEUo3FeqYFAu3PPiTPMOXgJUqYP6KWCPzQSE4aVahf9qjgldbLxpsiid2KzX0RnFWzqQtT5LgLdNoI9RA0bs1LoZjX8lS/YUOngwz2g+gdtlvtQXsDruezg1FFlIf6QOfg/mZP8YdTirYMOgZhv77M1nGfFs3Ly5VcdR+mQqg4/mw0O4+oZUKc70I4Ni8S3Cv9+9aZ5chCvgz9guszJi8s0nfZloQN2SZyh4bPwxqRxoHRPfZdxSBlwEw92RX4UzKnDxooGyUeWqNAgMBAAEwDQYJKoZIhvcNAQELBQADggEBAGKL7jQH1Qmx5E9j8QL6rjJ4JLA6/M1zP8rczafJn85U8m+ZN3V3kZt49vD2KrWDUnZAugJCXqiUrdRHVKXB08VtdpYge9JeCZxm9jHKkxAlEdSFCV1aM9shcfKRjwf1LorrJjcYgCKrTjMqPzq5rMmN03XnFzyt+c6a+ElfXzcwlEwe2e6MMKdfiUmhvGkI9/QsDGfQsbmfzepMgwva87q3BdcTsbDoi35qV8HtZuDta/CJ5N+yx1XC0JSYqB6asddooKntxUK0XE+ajUCW7qSzm9+5ppGq4NiwZSqydjoX304gF78KK9IO92jM2o3EZE=";

        DecryptionUtil decryptionUtil = new DecryptionUtil();

        String plain = "{\"request\":{\"header\":{\"userName\":\"pmjjby_user\",\"apiKey\":\"pmjjby_api_key_123\"},"
                + "\"payload\":{\"accountNumber\":\"12345678243\",\"cif\":\"CIF0012345\","
                + "\"urn\":\"JNS-PMJJBY-23-24-00000000001-12\",\"effectiveDate\":\"2026-08-31 10:15:00\","
                + "\"requestDate\":\"2026-08-31 10:15:00\",\"token\":\"8002adc6-8540-4b46-9cb5-7e89cd1eab67\"}}}";

        String encrypted = decryptionUtil.encrypt(plain, soaPrivateKey, pmjjbyPublicKey);
        System.out.println("ENCRYPTED PAYLOAD:\n" + encrypted);
        System.out.println("\nPOSTMAN BODY:\n{\"request\":{\"payload\":\"" + encrypted + "\"}}");

        String decrypted = decryptionUtil.decrypt(encrypted, soaPrivateKey, pmjjbyPublicKey);
        System.out.println("\nDECRYPTED REQUEST:\n" + decrypted);
    }
}
