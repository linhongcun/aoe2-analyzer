"""数据管线入口：npm run data
下载 SiegeEngineers/aoe2techtree（scripts/data_sources.json 固定提交）数据到 scripts/.cache/aoe2techtree-<commit>，生成 src/data/*.json 与 public/img/* 游戏图标。"""
import os,json,subprocess,sys,urllib.request
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)));os.chdir(ROOT)
PIN=json.load(open(os.path.join(ROOT,'scripts','data_sources.json')))['sources']['aoe2techtree']  # 固定提交（data:update 更新）
REF=os.environ.get('AOE_TT_REF',PIN['commit'])
C=os.path.join(ROOT,'scripts','.cache','aoe2techtree-'+REF[:7]);os.makedirs(C+'/trees',exist_ok=True)
RAW=f'https://raw.githubusercontent.com/{PIN["repo"]}/{REF}/data/'
def get(u,p):
    if not os.path.exists(p): urllib.request.urlretrieve(u,p)
get(RAW+'data.json',C+'/data.json');get(RAW+'locales/en/strings.json',C+'/en.json');get(RAW+'locales/zh/strings.json',C+'/zh.json')
d=json.load(open(C+'/data.json'))
for v in d['civs'].values():
    n=v['internal_name'].upper();n='HINDUSTANIS' if n=='INDIANS' else n
    get(RAW+f'trees/{n}.json',C+f'/trees/{n}.json')
env=dict(os.environ,AOE_CACHE=C,AOE_TT_REF=REF)
for s in ['civs_build.py','units_build.py','techs_build.py','trees_build.py','buildings_build.py','icons_hires.py']:
    print('==',s);subprocess.run([sys.executable,'scripts/'+s],env=env,check=True)
subprocess.run(['node','scripts/catalog_introductions.mjs'],env=env,check=True)
