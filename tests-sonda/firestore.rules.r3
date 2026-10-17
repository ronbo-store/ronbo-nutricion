// ============================================================
// CANDIDATO r3 (16/10/2026, A2 autorizado): sobre r2 (que queda
// preservado e intacto) se añade la integridad bidireccional de
// recibos de consentimiento verificada en el experimento C2
// (23/23, corrida 38962565773): toda transición de
// consentimiento del cliente exige, en el MISMO lote, su
// recibo en consent_receipts/{uid}_{seq}, con consentSeq en +1
// exacto; el borrado de la propia cuenta exige el documento de
// cierre consent_receipts/{uid} en el mismo lote. El
// propietario no puede tocar consentSeq/consentReceiptId.
// NO PUBLICADO. Pendiente de validación oficial B2.
// ============================================================
rules_version = '2';

// =====================================================================
// RONBO NUTRI — Firestore security rules for the NEW independent project
// PROPUESTA CUESTIONARIO v1 — 2026-10-16. NOT PUBLISHED.
// Base: el texto PUBLICADO en H-C1 (propuesta-renovacion, SHA-256
// e874f453...), sin tocar sus sentencias salvo lo indicado abajo.
// Cambios de esta propuesta (aprobación v1 del 16/10/2026):
//   - users.create: se prohíbe nacer con 'health' o 'healthConsent'.
//   - users update del propietario: ya NO puede tocar 'healthConsent'
//     ni el legado 'health' del cliente (Decisión 7).
//   - users: dos sentencias nuevas SOLO del cliente para su
//     consentimiento específico (healthConsent: otorgar/renovar y
//     retirar), con fechas == request.time (patrón H-C1 B1).
//   - Nueva subcolección users/{uid}/healthDeclarations/{declId}:
//     las respuestas de salud fuera del documento general.
// Do not deploy without Ronald's express authorization.
//
// Derived from the actual operations in app.js (dev branch
// dev/ronbo-nutri-v3, commits 9c73db4 / ede2eb2 / 512b283):
//   - Registration creates users/{own uid} born unprivileged
//     (isOwner=false, approved=false, role='user') and, since Block 4,
//     always with acceptedTerms=true and adultConfirmed=true.
//   - The trainer (users doc with isOwner=true) lists all users,
//     approves/revokes, sets goals, edits client profiles and weights,
//     and authors training plans.
//   - Clients query their data filtered by ownerUid == own uid
//     (training collections use clientUid); unfiltered lists by
//     non-owners must fail.
//   - Privacy (Block 4): a client may withdraw consent (sets
//     acceptedTerms=false, approved=false, consentWithdrawnAt) and may
//     delete their OWN documents and user doc (right to erasure).
//     A client can NEVER set approved=true or touch role/isOwner.
//   - There is NO code path that creates an owner: the first owner is
//     set manually in the Firebase console by the project IAM owner.
//
// Collections: users, nutrition_meals, nutrition_weight,
//              nutrition_progress, meal_help,
//              training_plans, training_logs
// =====================================================================

service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- Helpers ----------
    function signedIn() {
      return request.auth != null;
    }
    function myDoc() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }
    function myDocExists() {
      return exists(/databases/$(database)/documents/users/$(request.auth.uid));
    }
    function isOwnerUser() {
      return signedIn() && myDocExists() && myDoc().isOwner == true;
    }
    function isApprovedUser() {
      return signedIn() && myDocExists() && (myDoc().isOwner == true || myDoc().approved == true);
    }
    function isSelf(uid) {
      return signedIn() && request.auth.uid == uid;
    }
    // ---------- Consent receipts (A2, experimento C2 verificado) ----------
    function userPath(uid) {
      return /databases/$(database)/documents/users/$(uid);
    }
    function receiptPath(rid) {
      return /databases/$(database)/documents/consent_receipts/$(rid);
    }
    // Transition type derived ONLY from enumerated (before, after)
    // pairs; any other combination yields '' (no valid type, so no
    // receipt can accompany it and the transition is denied).
    function receiptType(before, after) {
      let bs = before.get('healthConsent', {}).get('status', 'none');
      let as2 = after.get('healthConsent', {}).get('status', 'none');
      return bs != as2
        ? (as2 == 'accepted' ? (bs == 'withdrawn' ? 'specific-renewed' : 'specific-granted')
                            : (as2 == 'withdrawn' ? 'specific-withdrawn' : ''))
        : (before.get('acceptedTerms', false) != after.get('acceptedTerms', false)
            ? (after.get('acceptedTerms', false) == true ? 'general-renewed' : 'general-withdrawn')
            : '');
    }
    function receiptVersion(after, type) {
      return (type == 'general-renewed' || type == 'general-withdrawn' || type == 'registered')
        ? after.get('termsVersion', '')
        : after.get('healthConsent', {}).get('version', '');
    }
    // The receipt that must exist AFTER the same batch: exact id,
    // owner uid, type, version and server timestamp of THIS request.
    function receiptMatches(rid, uid, type, version) {
      return existsAfter(receiptPath(rid))
        && getAfter(receiptPath(rid)).data.uid == uid
        && getAfter(receiptPath(rid)).data.type == type
        && getAfter(receiptPath(rid)).data.version == version
        && getAfter(receiptPath(rid)).data.at == request.time;
    }

    // ---------- users ----------
    match /users/{uid} {
      allow get: if isSelf(uid) || isOwnerUser();
      allow list: if isOwnerUser();

      // Registration: own doc only, born unprivileged, with the privacy
      // consent and the 18+ confirmation the app always records.
      allow create: if isSelf(uid)
        && request.resource.data.isOwner == false
        && request.resource.data.approved == false
        && request.resource.data.role == 'user'
        && request.resource.data.acceptedTerms == true
        && request.resource.data.termsAcceptedAt == request.time
        && request.resource.data.adultConfirmed == true
        && !('health' in request.resource.data)
        && !('healthConsent' in request.resource.data)
        // A2: registration is the first consent act — it must carry
        // its 'registered' receipt in the same batch (seq starts at 1).
        && request.resource.data.consentSeq == 1
        && request.resource.data.consentReceiptId == uid + '_1'
        && receiptMatches(uid + '_1', uid, 'registered',
                          request.resource.data.termsVersion);

      // The trainer may update any user document (approval, goals,
      // profile, notes) — EXCEPT the client's specific-consent state
      // and the legacy health answers, which belong to the client
      // (Decision 7). The console bootstrap is IAM-level and is not
      // affected by rules.
      allow update: if isOwnerUser()
        && !request.resource.data.diff(resource.data).affectedKeys()
              .hasAny(['healthConsent', 'health', 'consentSeq', 'consentReceiptId']);
      // A client may update ONLY harmless profile fields of their own doc.
      allow update: if isSelf(uid)
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['name', 'phone', 'gender', 'social', 'photoURL']);
      // Consent withdrawal: a client may revoke THEMSELVES only —
      // acceptedTerms=false, approved=false, withdrawal timestamp —
      // and nothing else in the same write. At least one of the two
      // state flags must actually CHANGE value: a repeat withdrawal
      // against an already-withdrawn document (only the timestamp
      // would move) is denied, so the recorded withdrawal date is
      // never silently overwritten (H-C1 B2, 2026-10-16). The
      // withdrawal timestamp must be the server time of the request
      // (H-C1 B1): literal dates are rejected.
      allow update: if isSelf(uid)
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['acceptedTerms', 'approved', 'consentWithdrawnAt', 'consentSeq', 'consentReceiptId'])
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasAny(['acceptedTerms', 'approved'])
        && request.resource.data.acceptedTerms == false
        && request.resource.data.approved == false
        && request.resource.data.consentWithdrawnAt == request.time
        // A2: coupled 'general-withdrawn' receipt, seq +1 exactly.
        && request.resource.data.consentSeq == resource.data.consentSeq + 1
        && request.resource.data.consentReceiptId == uid + '_' + string(request.resource.data.consentSeq)
        && receiptMatches(request.resource.data.consentReceiptId, uid,
                          'general-withdrawn', request.resource.data.termsVersion);

      // Consent renewal: a user may re-grant ONLY their own consent —
      // acceptedTerms=true with the acceptance timestamp and the
      // notice version, and NOTHING else in the same write.
      // affectedKeys() only lists fields whose value actually CHANGES:
      // termsVersion is therefore allowed to travel but NOT required
      // to change (a user already on the current version string must
      // still be able to renew — H-C1 B3-1, 2026-10-16); its resulting
      // value is still type-checked below. The acceptance timestamp
      // must be the server time of the request (H-C1 B1): the app
      // sends serverTimestamp(), which resolves to request.time, and
      // literal dates (e.g. 2030) are rejected. Approval is not
      // touched: it stays the trainer's separate decision. The
      // withdrawal timestamp is preserved as history.
      allow update: if isSelf(uid)
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['acceptedTerms', 'termsAcceptedAt', 'termsVersion', 'consentSeq', 'consentReceiptId'])
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasAll(['acceptedTerms', 'termsAcceptedAt'])
        && request.resource.data.acceptedTerms == true
        && request.resource.data.termsAcceptedAt == request.time
        && request.resource.data.termsVersion is string
        // A2: coupled 'general-renewed' receipt, seq +1 exactly.
        // Renewal restores consent only — never approval (untouched
        // above) and never reactivates blocked declarations.
        && request.resource.data.consentSeq == resource.data.consentSeq + 1
        && request.resource.data.consentReceiptId == uid + '_' + string(request.resource.data.consentSeq)
        && receiptMatches(request.resource.data.consentReceiptId, uid,
                          'general-renewed', request.resource.data.termsVersion);

      // Specific health consent (metadata only — never answers).
      // Grant/renew: only the client, a NEW acceptance act: status
      // accepted, acceptance timestamp == server time, version text;
      // a previous withdrawal timestamp is preserved as history.
      allow update: if isSelf(uid)
        && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['healthConsent', 'consentSeq', 'consentReceiptId'])
        && request.resource.data.healthConsent.status == 'accepted'
        && request.resource.data.healthConsent.acceptedAt == request.time
        && request.resource.data.healthConsent.version is string
        && (!('healthConsent' in resource.data)
            || !('withdrawnAt' in resource.data.healthConsent)
            || request.resource.data.healthConsent.withdrawnAt
               == resource.data.healthConsent.withdrawnAt)
        // A2: grant/renew only from a non-accepted state, with its
        // coupled receipt ('specific-granted' or 'specific-renewed',
        // derived from the before/after pair), seq +1 exactly.
        && (!('healthConsent' in resource.data)
            || resource.data.healthConsent.status != 'accepted')
        && request.resource.data.consentSeq == resource.data.consentSeq + 1
        && request.resource.data.consentReceiptId == uid + '_' + string(request.resource.data.consentSeq)
        && receiptMatches(request.resource.data.consentReceiptId, uid,
                          receiptType(resource.data, request.resource.data),
                          request.resource.data.healthConsent.version);
      // Withdraw the specific consent: only from an accepted state,
      // withdrawal timestamp == server time, acceptance preserved.
      allow update: if isSelf(uid)
        && request.resource.data.diff(resource.data).affectedKeys()
              .hasOnly(['healthConsent', 'consentSeq', 'consentReceiptId'])
        && request.resource.data.healthConsent.status == 'withdrawn'
        && request.resource.data.healthConsent.withdrawnAt == request.time
        && resource.data.healthConsent.status == 'accepted'
        && request.resource.data.healthConsent.acceptedAt
           == resource.data.healthConsent.acceptedAt
        // A2: coupled 'specific-withdrawn' receipt, seq +1 exactly.
        && request.resource.data.consentSeq == resource.data.consentSeq + 1
        && request.resource.data.consentReceiptId == uid + '_' + string(request.resource.data.consentSeq)
        && receiptMatches(request.resource.data.consentReceiptId, uid,
                          'specific-withdrawn',
                          request.resource.data.healthConsent.version);

      // The trainer deletes user docs (reject flow).
      allow delete: if isOwnerUser();
      // A client may delete their OWN user doc (right to erasure,
      // Block 4) ONLY in the same batch that creates their
      // 'account-closed' receipt (A2): no closure without receipt,
      // no receipt without closure.
      allow delete: if isSelf(uid)
        && existsAfter(receiptPath(uid))
        && getAfter(receiptPath(uid)).data.type == 'account-closed'
        && getAfter(receiptPath(uid)).data.uid == uid
        && getAfter(receiptPath(uid)).data.at == request.time;

      // ---------- Health declarations (the ANSWERS) ----------
      // They live outside the general document so that rules can
      // actually block them (rules authorize whole documents).
      match /healthDeclarations/{declId} {
        // The client reads ALL of their own declarations (current and
        // blocked). The trainer reads ONLY the active one and ONLY
        // while the client's specific consent is accepted. Nobody
        // else reads anything.
        allow get, list: if isSelf(uid)
          || (isOwnerUser()
              && resource.data.state == 'active'
              && get(/databases/$(database)/documents/users/$(uid))
                   .data.healthConsent.status == 'accepted'
              && get(/databases/$(database)/documents/users/$(uid))
                   .data.acceptedTerms == true);

        // Create: only the client, an ACTIVE declaration, and only
        // with their specific consent currently accepted.
        allow create: if isSelf(uid)
          && request.resource.data.state == 'active'
          && request.resource.data.version is number
          && request.resource.data.conditions is list
          && request.resource.data.details is string
          && request.resource.data.declaredAt == request.time
          && get(/databases/$(database)/documents/users/$(uid))
               .data.healthConsent.status == 'accepted';

        // Update the CURRENT declaration: only the client, only its
        // contents. Blocked declarations are immutable for everyone.
        allow update: if isSelf(uid)
          && resource.data.state == 'active'
          && request.resource.data.state == 'active'
          && request.resource.data.diff(resource.data).affectedKeys()
                .hasOnly(['conditions', 'details', 'updatedAt'])
          && request.resource.data.updatedAt == request.time;

        // Block the current declaration when the specific consent is
        // withdrawn: only the client, only the state change.
        allow update: if isSelf(uid)
          && resource.data.state == 'active'
          && request.resource.data.state == 'blocked'
          && request.resource.data.diff(resource.data).affectedKeys()
                .hasOnly(['state', 'blockedAt'])
          && request.resource.data.blockedAt == request.time;

        // Delete: only the client, their own declarations.
        allow delete: if isSelf(uid);
      }
    }

    // ---------- Client nutrition data ----------
    // Create/update require an approved account and own ownerUid.
    // Delete of one's own documents is allowed regardless of approval
    // status (erasure must work even after withdrawal/revocation);
    // nobody can delete another client's documents except the trainer.
    match /nutrition_meals/{docId} {
      allow create: if isApprovedUser()
        && request.resource.data.ownerUid == request.auth.uid;
      allow get, list: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow update: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow delete: if isOwnerUser()
        || (signedIn() && resource.data.ownerUid == request.auth.uid);
    }

    match /nutrition_weight/{docId} {
      allow create: if isApprovedUser()
        && request.resource.data.ownerUid == request.auth.uid;
      allow get, list: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow update: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow delete: if isOwnerUser()
        || (signedIn() && resource.data.ownerUid == request.auth.uid);
    }

    match /nutrition_progress/{docId} {
      allow create: if isApprovedUser()
        && request.resource.data.ownerUid == request.auth.uid;
      allow get, list: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow update: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow delete: if isOwnerUser()
        || (signedIn() && resource.data.ownerUid == request.auth.uid);
    }

    match /meal_help/{docId} {
      allow create: if isApprovedUser()
        && request.resource.data.ownerUid == request.auth.uid;
      allow get, list: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow update: if isOwnerUser()
        || (isApprovedUser() && resource.data.ownerUid == request.auth.uid);
      allow delete: if isOwnerUser()
        || (signedIn() && resource.data.ownerUid == request.auth.uid);
    }

    // ---------- Training (Block 3) ----------
    // Plans are authored ONLY by the trainer. Clients read their own.
    match /training_plans/{docId} {
      allow get, list: if isOwnerUser()
        || (isApprovedUser() && resource.data.clientUid == request.auth.uid);
      allow create, update, delete: if isOwnerUser();
    }

    // Session logs: clients create/delete their own (done/undo);
    // no updates (the app toggles by create/delete). Trainer reads all.
    match /training_logs/{docId} {
      allow create: if isApprovedUser()
        && request.resource.data.clientUid == request.auth.uid
        && request.resource.data.done == true;
      allow get, list: if isOwnerUser()
        || (isApprovedUser() && resource.data.clientUid == request.auth.uid);
      allow delete: if isOwnerUser()
        || (signedIn() && resource.data.clientUid == request.auth.uid);
    }

    // ---------- Consent receipts (A2) ----------
    // Append-only proof of consent acts (metadata only — never
    // answers). A receipt can be created ONLY together with the
    // real transition it records (checked against the user doc
    // before AND after the batch), by the account holder about
    // themselves. Nobody updates receipts; only the owner
    // deletes them (the retention purge).
    match /consent_receipts/{rid} {
      allow get, list: if isOwnerUser()
        || (signedIn() && resource.data.uid == request.auth.uid);

      allow create: if signedIn()
        && request.resource.data.keys().hasOnly(['uid', 'email', 'type', 'version', 'at'])
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.email is string
        && request.resource.data.version is string
        && request.resource.data.at == request.time
        && (
          // Closure marker: this same batch deletes the user doc.
          ( rid == request.auth.uid
            && request.resource.data.type == 'account-closed'
            && exists(userPath(request.auth.uid))
            && request.resource.data.version
                 == get(userPath(request.auth.uid)).data.get('termsVersion', '')
            && !existsAfter(userPath(request.auth.uid)) )
          ||
          // Registration event: this same batch creates the user doc.
          ( rid == request.auth.uid + '_1'
            && request.resource.data.type == 'registered'
            && !exists(userPath(request.auth.uid))
            && existsAfter(userPath(request.auth.uid))
            && getAfter(userPath(request.auth.uid)).data.consentSeq == 1
            && getAfter(userPath(request.auth.uid)).data.consentReceiptId == rid
            && request.resource.data.version
                 == getAfter(userPath(request.auth.uid)).data.termsVersion )
          ||
          // Consent transition event: the declared type and version
          // must equal the transition derived from before/after.
          ( exists(userPath(request.auth.uid))
            && existsAfter(userPath(request.auth.uid))
            && getAfter(userPath(request.auth.uid)).data.consentReceiptId == rid
            && request.resource.data.type
                 == receiptType(get(userPath(request.auth.uid)).data,
                                getAfter(userPath(request.auth.uid)).data)
            && request.resource.data.version
                 == receiptVersion(getAfter(userPath(request.auth.uid)).data,
                                   request.resource.data.type) )
        );

      allow update: if false;
      allow delete: if isOwnerUser();
    }

    // ---------- Everything else: denied ----------
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
