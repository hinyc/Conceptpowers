// @concept:output-locale @concept:governance-mode
// src/i18n/gateMessages.ts
// 커밋 게이트·훅이 "사람에게 보이는" 사유(permissionDecisionReason에 실리는 문장)를 ko/en 두 벌로 관리한다.
// 모델에게만 가는 additionalContext 지시문은 도구 지시문이라 영어 한 벌로 각 게이트에 남는다.
// 두 벌은 같은 모양이어야 한다 — en은 `typeof ko`로 묶어 키·인자가 어긋나면 타입 오류가 난다.
import type { Locale } from '../schema/initConfig.js';

const ko = {
  // --- 질문 접미사 -------------------------------------------------------------
  askSuffix: ' 그래도 커밋하시겠습니까?',
  editAskSuffix: ' 그래도 진행하시겠습니까?',

  // --- 판정 조립(preToolUse) -----------------------------------------------------
  denyRefNote:
    ' (항상 사람에게 묻는 항목도 포함 — 커밋이 어차피 진행되지 않으므로 따로 묻지 않고 함께 차단합니다)',
  deny: (count: number, refNote: string, detail: string) =>
    `[GOVERNANCE DENY] ${count}건 위반${refNote} — ${detail} strict 모드에서는 개념과 어긋난 커밋이 차단됩니다. 각 위반을 해소한 뒤 다시 커밋하세요(개념 수정 시 정합성 검사(update-concepts) 통과·충돌 0 필요).`,
  recordNoCode: '코드를 고치지 않고 바뀐 개념을 통과시키는 판단 기록',
  recordTestReview:
    '바뀐 개념에 맞춰 검사를 검토했다는 판단 기록(고침·고칠 필요 없음·검사 없음) — 고친 검사 파일을 같은 커밋에 넣으면 이 기록 없이도 통과합니다',
  recordApprove:
    '빨강(미승인) 개념을 초록(확정)으로 올리는 승인 — 사용자가 명시적으로 요청한 승인이어야 합니다',
  humanRecordCommand: (records: string, meanings: string) =>
    `[HUMAN RECORD] ${records} — ${meanings}. 사람의 확인을 거쳐 남겨야 합니다 — 사유가 맞는지 확인한 뒤 진행하세요.`,
  gateFailureChecks: (count: number, names: string) =>
    `[GATE FAILURE] 커밋 게이트 검사 ${count}종을 실행하지 못했습니다(${names})`,
  gateFailureCrash: (error: string) =>
    `[GATE FAILURE] 커밋 게이트 검사를 실행하지 못했습니다 — ${error}`,
  strictUnverified: ' strict 모드에서는 검사하지 못한 커밋을 차단합니다.',
  commitUnresolved: (reason: string) =>
    `[COMMIT UNRESOLVED] 실행 전에 커밋될 파일을 확정할 수 없습니다 — ${reason}`,

  // --- 게이트 공통 -----------------------------------------------------------------
  andMore: (n: number) => ` 외 ${n}개`,

  // --- 개별 게이트 -----------------------------------------------------------------
  unknownTags: (detail: string) =>
    `[WARNING] 정의되지 않은 개념 태그 — ${detail}. update-concepts로 개념을 정의하거나 태그를 고치세요.`,
  conceptless: (list: string) =>
    `[WARNING] 개념 없는 코드 — ${list}. 이 파일들 상단에 @concept 마커가 없습니다. 맞는 개념이 이미 있으면 scan으로 \`@concept:<slug>\`를 달고, 없으면 update-concepts(계기 B)로 개념을 정의해 달거나, 개념과 무관한 코드면 \`@concept:none\`을 명시하세요(공통 UI처럼 개념 없는 코드가 모인 폴더는 사람이 init.json의 noConceptGlobs로 한꺼번에 정할 수 있고, 재생성물·외부 코드만 ignoreGlobs에 추가).`,
  conflictedPending: (detail: string) =>
    `[CONFLICTED PENDING] ${detail}. 이 보류 개념은 다른 개념과 충돌해 아직 green이 될 수 없습니다. 충돌을 해소(개념 수정/분리)한 뒤 커밋하세요.`,
  unapprovedRed: (list: string) =>
    `[WARNING] 미승인 개념 참조 (status=red) — ${list}. 사용자가 아직 승인하지 않은 개념을 참조합니다. 승인은 사용자가 직접 요청할 때만 합니다(update-concepts 승인 흐름) — 커밋을 통과시키려고 승인하지 않습니다.`,
  staleArtifacts: (list: string) =>
    `[WARNING] 미커밋 생성 산출물 — ${list}. 플러그인이 자동 동기화한 산출물이 이번 커밋에 포함되지 않았습니다. git add로 함께 스테이징하세요.`,
  quality: (detail: string) =>
    `[WARNING] 품질 미달 green 개념 — ${detail}. green 개념은 관리 대상·작동 원리·집행 가능한 규칙이 필요하고, 규칙은 다른 개념 이름 없이 그대로 판별되어야 합니다. update-concepts로 사용자와 함께 부족한 부분을 채우세요.`,

  attestMissing: (list: string) =>
    `[WARNING] 충돌 검사 미실행 — ${list}. 이 개념 변경에 대한 신선한 정합성 검사 증빙이 없습니다. conceptpowers:update-concepts의 정합성 검사를 실행한 뒤 attest-consistency <slug> --result pass --compared all 로 기록하세요.`,
  attestUnmatched: (list: string) =>
    `[WARNING] 개념 파일의 slug 불일치 — ${list}. 파일 이름과 같은 slug의 개념을 찾을 수 없습니다(파일 이름≠안의 slug이거나 개념이 아닌 파일). 개념 파일 이름은 slug와 같아야 증빙·품질 판정 대상이 됩니다.`,

  evidenceMissing: '이번 커밋에 안 들어옴',
  evidenceDiffers:
    '커밋될 내용이 디스크의 기록과 다름(스테이징 뒤 바뀌었거나 이번 커밋 범위에서 빠짐)',
  evidenceGone: '디스크에 없는 기록이 커밋됨',
  evidence: (detail: string) =>
    `[EVIDENCE] 판정 근거 기록이 이번 커밋과 맞지 않습니다 — ${detail}. 고쳐진 개념과 맞물린 커밋에는 검사 증빙·검토 기록·코드무관 기록의 지금 내용이 함께 들어와야 저장소에 남습니다(디스크에만 있는 기록은 증빙이 아닙니다). 기록 파일을 다시 스테이징해 함께 커밋하세요.`,

  testFollowNone: (slug: string) => `${slug} -> 연결된 검사가 없습니다`,
  testFollowSome: (slug: string, shown: string, more: string) =>
    `${slug} -> 딸린 검사(하나도 안 옴): ${shown}${more}`,
  testFollow: (detail: string) =>
    `[TEST REVIEW] ${detail}. 개념이 바뀌었는데 그에 딸린 검사가 이번 커밋에 하나도 따라오지 않았습니다. 검사를 개념에 맞춰 고쳐 함께 스테이징하면 기록 없이 통과합니다. 고칠 필요가 없거나 검사가 없을 때만 사유를 기록하세요: attest-test-review <slug> --result no-impact|no-tests --note "<사유>".`,
  testScope: (shown: string, more: string) =>
    `[TEST SCOPE] 가리키는 개념이 없는 검사 파일: ${shown}${more}. 검사는 반드시 어떤 개념의 규칙을 검증하는지 밝혀야 합니다 — 첫머리에 @concept:<slug>를 적으세요('해당 개념 없음' 표시는 검사에 쓸 수 없습니다). 근거로 삼을 개념이 없으면 개념을 먼저 정의하세요.`,

  referenceLock: (rel: string) =>
    `[WARNING] 참고자료 기준점 커밋 — ${rel}. init.json의 referenceLock이 "local"인데 기준점 파일(참고자료 파일 이름·지문 목록)이 스테이징됐습니다. 올리려면 설정을 "shared"로 바꾸고, 아니면 스테이징에서 빼세요.`,
  referenceLocalAdvice:
    '로컬 전용으로 두려면 .gitignore에 docs/conceptpowers/reference/ 를 추가하고 스테이징에서 빼세요.',
  referenceForcedAdvice: (list: string) =>
    `${list}는 이미 .gitignore에 걸린 파일을 강제 추가로 담는 것입니다 — 로컬 전용으로 두려면 강제 추가(-f)를 빼세요.`,
  referenceDocs: (list: string, advice: string) =>
    `[WARNING] reference 문서 커밋 — ${list}. 참고자료에는 기밀 문서가 포함될 수 있습니다. 저장소에 올려도 되는 문서인지 확인하세요. ${advice}`,

  driftNoTaggedLabel: '@concept 태그가 붙은 스테이징 파일',
  driftDocLabel: (slug: string, docPath: string, label: string) =>
    `${slug}(문서: ${docPath}) <- ${label}`,
  driftMissingDoc: (detail: string, more: string) =>
    `[CONCEPT DRIFT] 수정된 개념과 맵핑된 코드가 커밋에 들어왔는데 개념 문서가 함께 오지 않았습니다 — ${detail}${more}. 표시된 개념 문서를 같은 커밋에 스테이징하세요.`,
  driftMissingCode: (detail: string, more: string) =>
    `[CONCEPT DRIFT] ${detail}${more}. 개념 문서가 커밋에 들어왔는데 연결된 코드가 하나도 안 따라왔습니다. 개념 변경에 맞춰 고친 코드를 함께 스테이징하세요 — 연결 코드 전부가 아니라 실제로 고친 파일이면 됩니다. 코드 변경이 정말 필요 없는 개념 수정이면 사용자 확인 후 기록하고 다시 커밋하세요: attest-no-code 슬러그 --note "사유" (개념의 현재 지문에 묶이며, 결산 이력에 사유가 함께 남습니다).`,

  // --- 거버넌스 파일 -------------------------------------------------------------------
  govConfigCommit: (rel: string, removed: boolean) =>
    `[GOVERNANCE CONFIG] 거버넌스 설정(${rel})이 ${removed ? '삭제됩니다' : '바뀌어 커밋에 들어옵니다'} — 문지기 강도·검사 범위·무시 목록을 정하는 파일입니다. 사용자가 직접 승인한 변경인지 확인하세요.`,
  govConceptDelete: (list: string) =>
    `[CONCEPT DELETE] 개념 문서 삭제 — ${list}. 개념을 지우면 그 규칙과 증빙·기준선 기록이 함께 사라지고, 그 개념을 가리키던 코드 표식은 미지 표식이 됩니다. 사용자가 직접 요청한 삭제인지 확인하세요.`,
  govRecordDelete: (list: string) =>
    `[GOVERNANCE RECORD] 증빙·기준선 기록 파일 삭제 — ${list}. 기록을 지우면 지난 판정의 근거가 사라집니다. 사용자가 직접 요청한 삭제인지 확인하세요.`,
  govUnreadable: (label: string) => `${label}(읽을 수 없음)`,
  govHumanRecord: (list: string) =>
    `[HUMAN RECORD] 바뀐 개념을 코드 변경 없이(no-code) 또는 검사 검토로(test-review) 통과시키는 판단 기록이 커밋에 들어옵니다 — ${list}. 사람의 확인을 거친 기록인지 확인하세요.`,
  govConfigUncommitted: (rel: string) =>
    `[GOVERNANCE CONFIG] 거버넌스 설정(${rel})이 마지막 커밋과 다른데 이번 커밋에 들어오지 않습니다 — 문지기는 이 커밋되지 않은 설정(강도·검사 범위·무시 목록)으로 판정합니다. 사용자가 직접 바꾼 설정인지 확인하세요.`,
  govEditConfig: (shown: string) =>
    `[GOVERNANCE CONFIG] 거버넌스 설정 파일(${shown})을 직접 고치려 합니다 — 문지기 강도·검사 범위·무시 목록은 사용자만 바꿉니다.`,
  govEditRecord: (shown: string) =>
    `[GOVERNANCE RECORD] 증빙·기준선 기록(${shown})을 직접 고치려 합니다 — 기록은 정식 명령(attest-consistency·attest-test-review·attest-no-code)과 커밋 뒤 결산만 씁니다.`,
  govEditConceptDoc: (shown: string) =>
    `[CONCEPT DOC] 개념 문서(${shown})를 직접 고치려 합니다 — 개념 문서의 내용 변경은 사람의 확인을 거칩니다.`,
};

export type GateText = typeof ko;

const en: GateText = {
  askSuffix: ' Commit anyway?',
  editAskSuffix: ' Proceed anyway?',

  denyRefNote:
    ' (includes items that are always asked of a person — the commit will not proceed anyway, so they are blocked together instead of asked separately)',
  deny: (count, refNote, detail) =>
    `[GOVERNANCE DENY] ${count} violation(s)${refNote} — ${detail} In strict mode, commits that diverge from the concepts are blocked. Resolve each violation, then commit again (editing a concept requires passing the consistency check (update-concepts) with zero conflicts).`,
  recordNoCode: 'a judgment record that lets a changed concept pass without code changes',
  recordTestReview:
    'a judgment record that the tests were reviewed against the changed concept (updated / no impact / no tests) — staging the updated test files in the same commit passes without this record',
  recordApprove:
    'an approval that promotes a red (unapproved) concept to green (settled) — it must be an approval the user explicitly requested',
  humanRecordCommand: (records, meanings) =>
    `[HUMAN RECORD] ${records} — ${meanings}. This must be recorded with a person's confirmation — check that the reason is right, then proceed.`,
  gateFailureChecks: (count, names) =>
    `[GATE FAILURE] ${count} commit-gate check(s) could not be run (${names})`,
  gateFailureCrash: (error) => `[GATE FAILURE] The commit gate could not run — ${error}`,
  strictUnverified: ' In strict mode, commits that could not be checked are blocked.',
  commitUnresolved: (reason) =>
    `[COMMIT UNRESOLVED] The files to be committed cannot be determined before the command runs — ${reason}`,

  andMore: (n) => ` and ${n} more`,

  unknownTags: (detail) =>
    `[WARNING] Undefined concept tag — ${detail}. Define the concept with update-concepts or fix the tag.`,
  conceptless: (list) =>
    `[WARNING] Code without a concept — ${list}. These files have no @concept marker at the top. If a matching concept already exists, add \`@concept:<slug>\` with scan; if not, define one with update-concepts (trigger B) and tag it; for code no concept governs, mark it explicitly with \`@concept:none\` (a folder of shared code with no concept, such as common UI, can be declared once by a person via noConceptGlobs in init.json; add only generated or external code to ignoreGlobs).`,
  conflictedPending: (detail) =>
    `[CONFLICTED PENDING] ${detail}. This pending concept conflicts with another concept and cannot become green yet. Resolve the conflict (revise or split the concepts), then commit.`,
  unapprovedRed: (list) =>
    `[WARNING] Reference to an unapproved concept (status=red) — ${list}. This references a concept the user has not approved yet. Approval happens only when the user asks for it directly (update-concepts approval flow) — never approve just to get a commit through.`,
  staleArtifacts: (list) =>
    `[WARNING] Uncommitted generated artifacts — ${list}. Artifacts the plugin synced automatically are not part of this commit. Stage them together with git add.`,
  quality: (detail) =>
    `[WARNING] Green concept below the quality floor — ${detail}. A green concept needs a managed subject, an operating principle, and enforceable rules, and each rule must be decidable without naming other concepts. Fill in the missing parts together with the user using update-concepts.`,

  attestMissing: (list) =>
    `[WARNING] Conflict check not run — ${list}. There is no fresh consistency-check attestation for this concept change. Run the consistency check of conceptpowers:update-concepts, then record it with attest-consistency <slug> --result pass --compared all.`,
  attestUnmatched: (list) =>
    `[WARNING] Concept file slug mismatch — ${list}. No concept with the same slug as the file name was found (the file name differs from the slug inside, or it is not a concept file). A concept file name must equal its slug to be covered by attestation and quality checks.`,

  evidenceMissing: 'not part of this commit',
  evidenceDiffers:
    'the content to be committed differs from the record on disk (changed after staging, or left out of this commit)',
  evidenceGone: 'a record that does not exist on disk is being committed',
  evidence: (detail) =>
    `[EVIDENCE] The judgment-evidence records do not match this commit — ${detail}. A commit that engages a changed concept must include the current contents of the attestation, test-review and no-code records so they persist in the repository (a record that exists only on disk is not evidence). Stage the record files again and commit them together.`,

  testFollowNone: (slug) => `${slug} -> no tests are linked`,
  testFollowSome: (slug, shown, more) =>
    `${slug} -> related tests (none came along): ${shown}${more}`,
  testFollow: (detail) =>
    `[TEST REVIEW] ${detail}. The concept changed, but none of its related tests came along in this commit. Update the tests to match the concept and stage them together to pass without a record. Record a reason only when no change is needed or no tests exist: attest-test-review <slug> --result no-impact|no-tests --note "<reason>".`,
  testScope: (shown, more) =>
    `[TEST SCOPE] Test files that point to no concept: ${shown}${more}. A test must state which concept's rules it verifies — put @concept:<slug> at the top ('no concept' markers cannot be used for tests). If no concept can serve as the basis, define the concept first.`,

  referenceLock: (rel) =>
    `[WARNING] Reference baseline commit — ${rel}. referenceLock in init.json is "local", but the baseline file (list of reference file names and fingerprints) is staged. To commit it, change the setting to "shared"; otherwise unstage it.`,
  referenceLocalAdvice:
    'To keep them local, add docs/conceptpowers/reference/ to .gitignore and unstage them.',
  referenceForcedAdvice: (list) =>
    `${list} is already ignored by .gitignore and enters the commit only through a force-add — to keep it local, drop the force-add (-f).`,
  referenceDocs: (list, advice) =>
    `[WARNING] Reference documents commit — ${list}. Reference material may include confidential documents. Check that these are safe to push to the repository. ${advice}`,

  driftNoTaggedLabel: 'staged files tagged with @concept',
  driftDocLabel: (slug, docPath, label) => `${slug} (doc: ${docPath}) <- ${label}`,
  driftMissingDoc: (detail, more) =>
    `[CONCEPT DRIFT] Code mapped to a modified concept is in this commit, but the concept document did not come along — ${detail}${more}. Stage the listed concept documents in the same commit.`,
  driftMissingCode: (detail, more) =>
    `[CONCEPT DRIFT] ${detail}${more}. The concept document is in this commit, but none of its linked code came along. Stage the code you changed for the concept change — the files you actually edited, not every linked file. If the concept edit truly needs no code change, confirm with the user, record it, and commit again: attest-no-code <slug> --note "<reason>" (bound to the concept's current fingerprint; the reason is kept in the reconcile history).`,

  govConfigCommit: (rel, removed) =>
    `[GOVERNANCE CONFIG] The governance settings (${rel}) ${removed ? 'will be deleted' : 'changed and are part of this commit'} — this file sets the gate strength, check scope and ignore list. Confirm the change was approved by the user.`,
  govConceptDelete: (list) =>
    `[CONCEPT DELETE] Concept documents deleted — ${list}. Deleting a concept removes its rules along with its evidence and baseline records, and code markers pointing at it become unknown markers. Confirm the user asked for this deletion.`,
  govRecordDelete: (list) =>
    `[GOVERNANCE RECORD] Evidence/baseline record files deleted — ${list}. Deleting records removes the basis of past judgments. Confirm the user asked for this deletion.`,
  govUnreadable: (label) => `${label} (unreadable)`,
  govHumanRecord: (list) =>
    `[HUMAN RECORD] Judgment records that let a changed concept pass without code changes (no-code) or via test review (test-review) are in this commit — ${list}. Confirm they were recorded with a person's confirmation.`,
  govConfigUncommitted: (rel) =>
    `[GOVERNANCE CONFIG] The governance settings (${rel}) differ from the last commit but are not part of this commit — the gate judges by these uncommitted settings (strength, check scope, ignore list). Confirm the user changed them.`,
  govEditConfig: (shown) =>
    `[GOVERNANCE CONFIG] About to edit the governance settings file (${shown}) directly — only the user changes the gate strength, check scope and ignore list.`,
  govEditRecord: (shown) =>
    `[GOVERNANCE RECORD] About to edit the evidence/baseline record (${shown}) directly — records are written only by the official commands (attest-consistency, attest-test-review, attest-no-code) and the post-commit reconcile.`,
  govEditConceptDoc: (shown) =>
    `[CONCEPT DOC] About to edit the concept document (${shown}) directly — changes to a concept document's content go through a person's confirmation.`,
};

export const gateText: Record<Locale, GateText> = { ko, en };
