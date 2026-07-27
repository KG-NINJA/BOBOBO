# BOBOBO デジタル小動物PoC

既存のThree.jsキャラクターと6種類の感情モーションを残し、ブラウザ内の
状態機械と、低頻度のCloudflare Workers AI判定を組み合わせたデジタル小動物です。
Workerが未設定・停止中でも、BOBOBO本体はローカル判定だけで動き続けます。

## 構成

```text
GitHub Pages
├─ index.html                  既存の3D表示、関節、顔、感情モーション
├─ src/creature-state.js       内部状態、記憶、0〜100クランプ
├─ src/creature-controller.js  ローカル状態機械
├─ src/ai-client.js            低頻度・タイムアウト付きWorker通信
├─ src/debug-panel.js          ?debug=1 の開発パネル
└─ worker/                     Cloudflare Workers AIバックエンド
```

## ローカルで確認

ESモジュールを使うため、`index.html`を直接開かずHTTPサーバーを起動します。

```bash
npx serve .
```

表示されたURLをブラウザで開きます。開発パネルは末尾に`?debug=1`を付けます。

```text
http://localhost:3000/?debug=1
```

テスト：

```bash
npm test
cd worker
npm install
npm test
npm run typecheck
npm run dry-run
```

## 小動物の動作

内部値は`mood`、`energy`、`curiosity`、`trust`、`stress`、
`loneliness`の6個で、常に0〜100です。

- タップ：信頼が上がり、孤独が下がります。状態により喜ぶ、気にする、嫌がる反応になります。
- 連続タップ：回数とストレスに応じて警戒します。
- 放置：孤独が上がり、歩く、見る、眠るなどの自発行動へ移ります。
- 復帰：留守時間、信頼、孤独、睡眠状態に応じて反応します。
- 音：ユーザーが「音に反応する」を押した後、端末内で音量だけを測ります。音声は保存・送信しません。

記憶は`localStorage`へ保存します。個人情報や端末情報は収集しません。匿名IDは
Workerのレート制限補助だけに使います。`?debug=1`の「記憶をリセット」で削除できます。

## Workers AIを使う

モデルは`@cf/google/gemma-4-26b-a4b-it`です。変更する場合は
`worker/wrangler.jsonc`の`MODEL_ID`だけを変更します。

```bash
cd worker
npm install
npx wrangler dev
npx wrangler deploy
```

デプロイURLは次のどちらかで設定します。

1. `src/config.js`の`workerUrl`へ設定する。
2. ページを`?debug=1`で開き、Worker URL欄へ入力する。

アカウント固有URL、Cloudflare APIトークン、アカウントIDはリポジトリへ
コミットしないでください。認証情報はフロントエンドへ一切不要です。

ローカル画面からWorkerへ接続するときだけ、`worker/wrangler.jsonc`の
`ALLOW_LOCALHOST`を`"true"`にします。本番前に`"false"`へ戻します。

### AIを呼ぶ条件

- 自動判定は表示中のタブで60〜90秒に1回以下
- 前回と状態がほぼ同じなら送信しない
- 開発パネルの手動判定
- 1回7秒で中断し、失敗時はローカル状態機械へ戻る

クリック、ポインター移動、マイク音量、描画フレームごとには呼びません。
会話履歴や音声も送りません。

Workers AIは利用量に応じて課金または利用制限が発生する可能性があります。
ローカルのAI Binding利用もCloudflareアカウントへ接続します。利用量は
Cloudflareダッシュボードで確認してください。

## セキュリティ

- CORSは既定で`https://kg-ninja.github.io`のみ許可
- JSON以外、12 KB超の本文、不明なイベント、不正な数値を拒否
- イベントは固定タイプと経過秒だけをGemmaへ送信
- action、強度、継続時間、内部値の変化、reasonCodeをWorker側で再検証
- 不正なAI出力は安全な`idle`へ置換
- 同一匿名IDまたはIPの60秒以内の再実行は`429`と`Retry-After`を返す

現在のレート制限はPoC向けのインスタンス内メモリ方式です。複数拠点で厳密に
制限する本番段階では、Cloudflare Rate Limiting bindingまたはDurable Objectsを
利用してください。

## GitHub Pages

元の構成どおり、ビルド不要の静的ファイルです。リポジトリの
`Settings > Pages`で`Deploy from a branch`、対象ブランチの`/(root)`を選びます。
公開後、次を確認します。

1. BOBOBOが表示され、ブラウザのコンソールにエラーがない。
2. PCとスマートフォンでキャラクターのタップが反応する。
3. Worker URLが空でも自発行動と記憶が動く。
4. `?debug=1`で内部状態、AI接続状態、フォールバックを確認できる。

## PoC後の改善候補

- 分散レート制限
- 状態遷移の長時間プレイテストと数値調整
- 自動ブラウザテストのCI化
- アクセシビリティと低性能端末向け描画設定
