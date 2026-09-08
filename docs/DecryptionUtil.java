package com.mli.groupupsure.util;

import com.mli.groupupsure.exception.GenericCustomException;
import lombok.extern.slf4j.Slf4j;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.KeyFactory;
import java.security.NoSuchAlgorithmException;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.SignatureException;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.spec.InvalidKeySpecException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;

@Slf4j
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

        String soaPrivateKey = "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCzmHPrEqiM4JW9bNjMqsaZrTQKBOCgAMuOSQZ+zkixqAJnKCEyvp+NPLx5//SHhgHWfyJHwmVaeGymwKu5QZZ2/xTCK1s2aajJUEiqvP2lRfHyMRV9eXegIJcz/qOvUgQNYnBAIOca7UDvt/BUn726d1vwlh1WKN3v2CtXA9YC1OAkQy1Ttav7HT7n4K1r325obY7HO/J4R5JzW/fvKB06lmQMXFt92apAPc/BkgChN4D+kHxx9frw91p3axRgb04vNH1HpbPJ37XCZVXsGOqEj/cLGnyv0Mw8wktZiQN0mIFgNA3K7riZtmBn/SrKpA8+FCvSJ7V9Rn/dl4r34pJxAgMBAAECggEABq8wM6HmxdKHOY0F7y0qgIurTeBTWMUwI6gzuTprMc3gOVprd5CTzpK3LEkYCZzAWq1HQiQ54pGBmr29o814ALm6+i9EAR0S4AZFzsauCphqj5efK65pYvDKQTrzTj93VjpcFZjxPRBy8VEiEpDno6YVCmSYltgPyuvbkMIm6pqVW4Ji7iBPly+XF7C+5CUSrM5f75jvpB+Tya/BQYzWNt0UKWiKuscfHshyIifTykCB05VzaZUxPhZxoAXPtkLrW8NxmMYRt+bCGiMfdfIqdBlqpAUmB7Mxjb4Ok+2Qtc5o2f1f5FGZkJ6qfla9CXl5P+mmLauNdGRYYs/yQ83eWQKBgQD0reTHNFc+kmSetCbIvw1OGFf3KZEt1YRJSRSwcBq4EOm4evidGU5699rIZzsZYTjwWY/YVrRFI44T1OV+7c6Z+gJTYcX3izFGGLEEQUe1546SRLwAmJxUauQFhvxmS3YcJOGe/2EyDnSZUUZVsXYT/qHDL631YPXudzTjAFiG6QKBgQC756yFLaOPLp63le4f5aSb6lP8skgeZOoVav6RDrwv3Y7PBFAJoJilkcSEIDsSC2vr1YAogR6CIdfWjczp1+1+kjsB5sibeyP/6J31VBQZ5aQ8kl609KFgl75pk+U1puyieRxVa4/Ywna3745LafKn1gLkVvSwTtpHl+WJUQcKSQKBgDjRxQXphrUWI92i8jq9+yX+izbvZTJimgS2vuI2Nk42R0A69k7tGId/1UOijVvYcvOFqNzRTa2ckxrR3rV6Hfct0qpwUxuoLDod88WML03zxuz6nzn4Np138RnDfgt3TKc+fVKB9Z09NCCCejXeLxB3mjMMeHY6HQJSlmp8oxI5AoGAAtI/rOA6jHPOvkLqCGCSUCT8jda/bnVlblzk5ZirCqzw7/rImNxoblP592HkgSjavfe+rN0DcEDB1N7cLMapMjVP3X9xk6QNrlH3zS8t/hWMmbw4386sfZ7JpRwrXNrcwrO+0SmER2TkE27tXASDODHmaTdFBUCp1llZgO5OhMECgYA42EbUk1vuPmzIEZCx2MwpndpgKbi6A7hxMLfZ+FFpxrzmNE1NUFT+gPHMK9hdxSPvXwjd0DtZk9nO3DyYpI2qtq5wVKtmfZ4CfGipajTHlirvcRzU4W/hPE27TznJdy9P44NExMiy61alH29XE5Jzc9hK7YGrPynkJYWQDV6bJA==";

        String pmjjbyPublicKey = "MIIDSTCCAjGgAwIBAgIUW/FcZnRy7cl3GWWXdruwZ4cvzcowDQYJKoZIhvcNAQELBQAwNDETMBEGA1UEAwwKU09BLVBNSkpCWTEQMA4GA1UECgwHTWF4TGlmZTELMAkGA1UEBhMCSU4wHhcNMjYwOTA4MTA1ODM0WhcNMjgwOTA3MTA1ODM0WjA0MRMwEQYDVQQDDApTT0EtUE1KSkJZMRAwDgYDVQQKDAdNYXhMaWZlMQswCQYDVQQGEwJJTjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALOYc+sSqIzglb1s2MyqxpmtNAoE4KAAy45JBn7OSLGoAmcoITK+n408vHn/9IeGAdZ/IkfCZVp4bKbAq7lBlnb/FMIrWzZpqMlQSKq8/aVF8fIxFX15d6AglzP+o69SBA1icEAg5xrtQO+38FSfvbp3W/CWHVYo3e/YK1cD1gLU4CRDLVO1q/sdPufgrWvfbmhtjsc78nhHknNb9+8oHTqWZAxcW33ZqkA9z8GSAKE3gP6QfHH1+vD3WndrFGBvTi80fUels8nftcJlVewY6oSP9wsafK/QzDzCS1mJA3SYgWA0DcruuJm2YGf9KsqkDz4UK9IntX1Gf92XivfiknECAwEAAaNTMFEwHQYDVR0OBBYEFImy7pYFeuGw5mbo3o+PS3rYoYJqMB8GA1UdIwQYMBaAFImy7pYFeuGw5mbo3o+PS3rYoYJqMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBALJEfSWhIovr75IK9byr9N2Fv9c5V65LEQaqepUOeEUo6iR1xd6IHUU0A18mKH75JWQQQDMzMkUHRUURlzQx1t79IWsaM6HmL+wDJ9hzBhZCbRQ1QIgzwAtJNI53xHCci/T30z+sNXi5KycLii0ODJAlvHjLJEQiNitYT7LJwNt06eckap8FH+J9sRFPtftTbS7UWTIeVpJRlOeQPIiFZ9VCy2h4xoXw79Xzd0CQr/ipML2ZYWHq4h6NestiNxMnMtUDJo7Z3SLGg5Kbwy8h18OD67sI8Q6Jy+TBmgHeXaC5Zy2fCO2r2spaihEDDdtyFCsEHPCNMxE4HXpVtuPQUnQ=";

        String plain = "{\"request\":{\"header\":{\"userName\":\"pmjjby_user\",\"apiKey\":\"pmjjby_api_key_123\"},"
                + "\"payload\":{\"accountNumber\":\"12345678243\",\"cif\":\"CIF0012345\","
                + "\"urn\":\"JNS-PMJJBY-23-24-00000000001-12\",\"effectiveDate\":\"2026-08-31 10:15:00\","
                + "\"requestDate\":\"2026-08-31 10:15:00\",\"token\":\"8002adc6-8540-4b46-9cb5-7e89cd1eab67\"}}}";

        String encrypted = encrypt(plain, soaPrivateKey, pmjjbyPublicKey);
        System.out.println("ENCRYPTED PAYLOAD:\n" + encrypted);
        System.out.println("\nPOSTMAN BODY:\n{\"request\":{\"payload\":\"" + encrypted + "\"}}");

        String decrypted = decrypt(encrypted, soaPrivateKey, pmjjbyPublicKey);
        System.out.println("\nDECRYPTED REQUEST:\n" + decrypted);
    }
}
