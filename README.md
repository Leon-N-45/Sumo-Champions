# スモチャン -Sumo Champions-

ブラウザで遊べる2D相撲対戦ゲームです。力士を選んで取組を行い、押し出し・投げ・いなしを駆使して相手を土俵から出すか倒せば勝ちです。個人戦に加え、コスト制限つきで3人組を編成して戦う**団体戦**モードを搭載しています。

> 現在のバージョン: **Ver.20.0.0**

## 特徴

- 🥋 **個人戦** … 1対1の取組。取組数や優勝決定戦の有無を「相撲形式」から選べます。
- 👥 **団体戦** … コスト合計の上限内で3人組を編成して対戦。「二本先取」「勝ち抜き」など取組形式を選択可能。
- 🎮 **コントローラ対応** … キーボード・マウスのほか、USBコントローラ（SFC風の任天堂配置にも対応）だけでタイトルから取組まで遊べます。1P・2Pごとに操作方法を設定画面で選べます。
- 🤖 **多彩なAI** … 思考（力押し／技狙い／素直／変則）× プレイタイプ（パワー／テクニック／スピード／バランス）× レベル（幕下〜横綱の7段階）に個体差を加えたCPU。
- 🎵 **サウンド** … BGM・効果音・ボイスを個別に音量調整可能。選曲機能つき。
- 📊 **外部データ連携** … 力士・楽曲などのデータをGoogleスプレッドシート（CSV公開）から読み込み。通信に失敗しても、同梱のデータで起動します。
- 💻 **アプリ版** … Windows・Mac用のアプリとしても動かせます（下記）。

## 遊び方

ローカルにクローンして、`index.html` をブラウザで開くだけで起動します。

```bash
git clone https://github.com/Leon-N-45/Sumo-Champions.git
cd Sumo-Champions
# index.html をブラウザで開く
```

詳しい操作方法は [`manual.html`](manual.html) を参照してください。

## 操作のポイント

- 溜めキーを**握り続ける**ことでチャージが溜まり、ぶちかまし（前進突進）や組み合いからの投げが発動します。キーを離すとチャージは0に戻ります。
- 相手の攻撃に合わせて「いなし」を使うと、攻めを受け流して体勢を崩せます。
- タイトル画面で取消ボタンを長押しすると「ゲーム終了」、力士選択画面で長押しするとタイトルへ戻ります。
- タイトル以外の画面で3分間操作がないと、自動でタイトルへ戻ります（`js/config.js` の `IDLE_RETURN_SECONDS`）。

## データの更新

力士・BGMなどのデータはスプレッドシートから読み込みます。参照先は [`js/config.js`](js/config.js) の `SHEET_ID` です。

通信できない時に使う同梱データ（`js/data_local.js`）は、スプレッドシートを更新したら次のどちらかで作り直してください。

```bash
node tools/build_data.js
```

Windows では `update-data.bat` をダブルクリックしても同じです。

`js/config.js` の `OFFLINE_MODE` を `true` にすると、通信せずに同梱データだけで動きます。

## アプリ版（Windows・Mac）

`desktop-app/` に Electron のアプリ設定があります。

```bash
cd desktop-app
npm install
npm run build
```

`desktop-app/dist/` に Windows 用インストーラーができます。Mac 用（.dmg）は、master に反映するたびに GitHub Actions（「Mac版を作る」）で自動的に作られ、実行結果の Artifacts から受け取れます。

## ディレクトリ構成

```
.
├── index.html        # エントリーポイント（ゲーム本体）
├── manual.html       # 操作・遊び方マニュアル
├── update-data.bat   # 同梱データの作り直し（Windows）
├── css/              # スタイル
│   ├── base.css      #   ベース
│   ├── ui.css        #   UI
│   ├── battle.css    #   取組画面
│   ├── team.css      #   団体戦画面
│   └── webfonts.css  #   同梱のWebフォント
├── js/               # ロジック
│   ├── config.js     #   設定値・定数・参照URL
│   ├── data.js       #   外部CSVの読み込み・適用
│   ├── data_local.js #   通信できない時に使う同梱データ
│   ├── settings.js   #   各種設定
│   ├── idle.js       #   無操作時のタイトル復帰
│   ├── navigation.js #   方向キー・決定ボタンでの画面操作
│   ├── gamepad.js    #   コントローラ入力
│   ├── audio.js      #   BGM・SE・ボイス再生／音量管理
│   ├── player.js     #   力士のステータス・状態管理
│   ├── ai.js         #   CPUの思考ロジック
│   ├── game.js       #   個人戦の進行・物理演算・入力管理
│   ├── ui.js         #   個人戦の画面表示・演出
│   ├── team_game.js  #   団体戦の進行管理（編成・勝ち抜き）
│   └── team_ui.js    #   団体戦の画面表示
├── tools/            # データ・フォントの取り込みスクリプト
├── desktop-app/      # Windows・Mac用アプリ（Electron）
└── assets/           # 画像・フォント・BGM・効果音
    ├── img/
    ├── fonts/
    ├── bgm/
    └── se/
```

## 技術スタック

- HTML / CSS / Vanilla JavaScript（フレームワーク非依存）
- Web Audio API によるサウンド制御 / Gamepad API によるコントローラ入力
- Google スプレッドシート（CSV公開）をデータソースとして利用
- Electron（アプリ版）
