# ossann_mede_claude

おっさんの一人暮らしの部屋を、ただ眺めるだけのWebアプリ。

- 時間は現実の30倍で進む（箱庭の1日＝現実の48分）
- 箱庭の時刻は現実の時刻から計算する。いつ誰が開いても同じ瞬間が見える
- 見る側は何もできない。時刻は部屋の壁掛け時計でしか分からない
- 平日はリモートワーク、夜と休日はゲーム。季節は現実の日付に合わせて変わる
- 3Dモデルも音も、すべてコードで生成している（外部の素材なし）

詳しい仕様は [docs/SPEC.md](docs/SPEC.md) を参照。

## 開発

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ に出力
```

### 開発用パラメータ

URLに付けると、箱庭の状態を指定して確認できる。

| パラメータ | 例 | 内容 |
|---|---|---|
| `at` | `?at=09:05` | 箱庭の時刻（開いた時点の時刻を指定） |
| `dow` | `?dow=6` | 曜日（0=日曜） |
| `speed` | `?speed=0` | 時間の進む速さ（0で停止） |
| `season` | `?season=winter` | 季節 |
| `weather` | `?weather=rain` | 天気（clear / cloudy / rain / snow） |
| `hair` | `?hair=0.3` | 髪の量（1=ふさふさ、0=つるつる） |
| `weight` | `?weight=1` | 体型（0=ふつう、1=かなり太め） |
| `quality` | `?quality=low` | 画質（low / mid / high） |
| `cam` | `?cam=-1,1,-1,3` | カメラの注視点(x,y,z)と距離。方位角と仰角も続けて指定できる |

## 公開

`main` ブランチへの push で、GitHub Actions が GitHub Pages にデプロイする。
初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする必要がある。

## 構成

```
src/
  core/     時間・乱数・数学の小物
  world/    部屋・家具・窓の外・照明・季節・画面の描画
  ossan/    おっさんのモデル（スキンメッシュ）・姿勢・アニメーション・小道具
  brain/    一日の予定づくり、経路探索、行動
  audio/    Web Audio による効果音・環境音
  render/   カメラ・ポストエフェクト・画質設定
```
