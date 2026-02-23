# Debugging Firestore Persistence

The user reports that artifacts appear in the library immediately after creation but vanish after a page reload.

## Potential Causes
1. **Firestore Security Rules**: The most common cause. Rules might be blocking reads or writes, leading to only local/cached data being shown temporarily.
2. **Missing Index**: An `orderBy` query on a `serverTimestamp` might require an index, though usually only for multiple fields.
3. **Write Failures**: The write might be failing silently on the backend due to permission issues.
4. **Environment Variables**: If the keys are not correctly set in the environment where the app is being reloaded (e.g., development server vs production).

## Investigation Steps
1. **Check Console Errors**: Look for "Missing or insufficient permissions" or "The query requires an index".
2. **Verify Rules**: Confirm Firestore rules are in "Test Mode".
3. **Add Logging**: Log snapshot metadata to see if data is coming from the cache.

## Fix Strategy
1. Update `LibraryPage.jsx` to log errors more clearly.
2. Update `firebase.js` to ensure the project ID is correctly used.
3. Guide the user to update rules in the Firebase Console.
