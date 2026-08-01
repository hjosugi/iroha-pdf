/**
 * What the documentation site publishes, and where each document lands.
 *
 * The slug is a published URL. Once a store, an OAuth consent screen, or a
 * release note points at one of these, moving it breaks that reference, so
 * treat this table as an interface: add rows freely, rename them only
 * deliberately. `privacy` in particular is the address entered in App Store
 * Connect and Play Console — see docs/STORE_PRIVACY_CHECKLIST.md.
 */

export const REPOSITORY = 'hjosugi/iroha-pdf';
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
export const DEFAULT_BASE_URL = 'https://hjosugi.github.io/iroha-pdf';

export const HERO = {
  eyebrow: 'Local-first PDF workspace',
  lead: '軽量・ローカルファーストのPDFワークスペース。iOS / AndroidとWindows / macOS / Linux向けUIから、PDF操作、注釈、メモ、同期用データモデルを共有します。現在は署名・実機・OAuth検証前のエンジニアリングプレビューです。',
  leadEnglish:
    'Documents, notes and annotations stay on the device. Google Drive is optional, least-privilege, and travels directly between the app and Google — there is no Iroha PDF server in the middle.',
};

export const FACTS = [
  {
    term: 'ローカルファースト',
    termEnglish: 'Local-first',
    detail: 'デスクトップのローカルPDF表示はオフラインE2Eで検証しています。モバイルの物理端末ゲートは未完了です。',
  },
  {
    term: 'テレメトリなし',
    termEnglish: 'No telemetry',
    detail: '広告SDK・解析SDKを同梱せず、開発者が運用するコンテンツサーバーもありません。',
  },
  {
    term: '共有ドメインモデル',
    termEnglish: 'One data model',
    detail: 'PDF操作・注釈・同期をExpoモバイルとTauriデスクトップで共有します。',
  },
  {
    term: 'Apache-2.0',
    termEnglish: 'Open source',
    detail: '再現可能なSBOMとライセンス許可リストをCIで検証しています。',
  },
];

/**
 * `source` is relative to the repository root; `slug` is the published
 * directory. Every entry is rendered, linked from the landing page, and listed
 * in sitemap.xml.
 */
export const SECTIONS = [
  {
    id: 'overview',
    title: 'プロダクトと構成',
    titleEnglish: 'Product and architecture',
    blurb: 'どう組み立てられていて、どうビルドし、何が実際に検証済みか。',
    documents: [
      {
        source: 'docs/ARCHITECTURE.md',
        slug: 'architecture',
        label: 'Architecture',
        summary:
          'レンダラーだけをプラットフォーム別にし、ドメイン・ファイル操作・注釈形式・同期プロトコルを共有する構成。',
      },
      {
        source: 'docs/BUILD.md',
        slug: 'build',
        label: 'Build workflow',
        summary: 'go-task 3.52.0とFrostBuild v0.8.0の役割分担、固定バージョン、CIと同じ入口。',
      },
      {
        source: 'docs/VERIFICATION.md',
        slug: 'verification',
        label: 'Verification report',
        summary: '実際に実行して通ったコマンドと、まだ検証していないこと。',
      },
      {
        source: 'docs/GOOGLE_DRIVE.md',
        slug: 'google-drive',
        label: 'Google Drive integration',
        summary: '`drive.file` / `drive.appdata` の最小権限、同期ファイル構造、競合ルール。',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'プライバシーとセキュリティ',
    titleEnglish: 'Privacy and security',
    blurb: '端末に何が残り、何が送られ、誰が消せるのか。ストア申告の入力元でもあります。',
    documents: [
      {
        source: 'docs/PRIVACY_POLICY.md',
        slug: 'privacy',
        label: 'Privacy policy',
        summary: '公開プライバシーポリシー。ストアとOAuth同意画面へ入力する安定URLです。',
        stable: true,
      },
      {
        source: 'docs/PRIVACY_SECURITY.md',
        slug: 'privacy-security',
        label: 'Privacy and security model',
        summary: 'データフロー、保存インベントリ、脅威モデル、ログ規則、既知の限界。',
      },
      {
        source: 'docs/STORE_PRIVACY_CHECKLIST.md',
        slug: 'store-privacy-checklist',
        label: 'Store privacy checklist',
        summary: 'App Store / Google Play / OAuth verificationの申告チェックリスト。',
      },
      {
        source: 'SECURITY.md',
        slug: 'security',
        label: 'Security policy',
        summary: '脆弱性の非公開報告手順と、公開Issueに書いてはいけないもの。',
      },
    ],
  },
  {
    id: 'quality',
    title: '品質とリリース',
    titleEnglish: 'Quality and release',
    blurb: '何がテストされ、何がリリースを止めていて、mainに何が要求されるか。',
    documents: [
      {
        source: 'docs/TEST_PLAN.md',
        slug: 'test-plan',
        label: 'Test plan',
        summary: '自動テストの範囲、E2Eが実際に見ている挙動、モバイルビルドの実測。',
      },
      {
        source: 'docs/UI_UX_AUDIT.md',
        slug: 'ui-ux-audit',
        label: 'UI / UX audit',
        summary: '通常画面を入口から終了まで見直した結果、修正内容、まだ物理端末で確認すべき項目。',
      },
      {
        source: 'docs/RELEASE_GATE.md',
        slug: 'release-gate',
        label: 'Release gate',
        summary: '署名済みアーティファクトの証跡が揃うまでリリースを止める表。現在blocked。',
      },
      {
        source: 'docs/MAIN_BRANCH_PROTECTION.md',
        slug: 'main-branch-protection',
        label: 'Main branch protection',
        summary: '`main`に要求する保護設定と、それを適用・検証するスクリプト。',
      },
      {
        source: 'CHANGELOG.md',
        slug: 'changelog',
        label: 'Changelog',
        summary: 'リリースごとの修正・追加と、まだ添付していない署名済みパッケージの理由。',
      },
    ],
  },
  {
    id: 'reference',
    title: '調査と資産',
    titleEnglish: 'Research and assets',
    blurb: '設計判断の根拠、ブランド資産、第三者コンポーネント。',
    documents: [
      {
        source: 'docs/REPOSITORY_RESEARCH.md',
        slug: 'repository-research',
        label: 'Repository research',
        summary: '既存PDFアプリとライブラリの比較、採用・不採用の理由とライセンス上の制約。',
      },
      {
        source: 'docs/BRAND.md',
        slug: 'brand',
        label: 'Brand assets',
        summary: '`い`のマーク、生成元SVG、名称の衝突調査、ストアスクリーンショットの規則。',
      },
      {
        source: 'THIRD_PARTY_NOTICES.md',
        slug: 'third-party-notices',
        label: 'Third-party notices',
        summary: '依存する主要コンポーネントとライセンス。',
      },
    ],
  },
];

export const DOCUMENTS = SECTIONS.flatMap((section) =>
  section.documents.map((document) => ({ ...document, section: section.id })),
);
