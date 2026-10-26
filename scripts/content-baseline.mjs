/** Frozen migration debt (#442): remove entries as visible sources are fixed.
 * This validator does not remove author/MIT attribution or edit existing data.
 */
export const LEGACY_SOURCE_BASELINE = Object.freeze(
  [
    {
      file: 'src/data/build-orders/archers-19.json',
      path: '/license',
      format: 'source-text',
      valueSha256: '624f4dae4528cf46c931b8f79bdbfa33fc41f278217a2044b640ef1600d845f5',
    },
    {
      file: 'src/data/build-orders/archers-19.json',
      path: '/sources/0/ref',
      format: 'source-text',
      valueSha256: '7329e5fec835f6ef00fc954dcbe22529f520edb53c45e2c0def3436db4b65d3f',
    },
    {
      file: 'src/data/build-orders/archers-19.json',
      path: '/sources/0/section',
      format: 'source-text',
      valueSha256: 'd79f332d4f731fd3cfefd105129831d0867dfc34c2b43c3ab211dd6eb32f73d9',
    },
    {
      file: 'src/data/build-orders/drush-fc.json',
      path: '/license',
      format: 'source-text',
      valueSha256: '624f4dae4528cf46c931b8f79bdbfa33fc41f278217a2044b640ef1600d845f5',
    },
    {
      file: 'src/data/build-orders/drush-fc.json',
      path: '/sources/0/ref',
      format: 'source-text',
      valueSha256: '7329e5fec835f6ef00fc954dcbe22529f520edb53c45e2c0def3436db4b65d3f',
    },
    {
      file: 'src/data/build-orders/drush-fc.json',
      path: '/sources/0/section',
      format: 'source-text',
      valueSha256: 'e405e2d00d6cae94fe397ea2d150839a150a09b46aff204867861cfa2bd803a3',
    },
    {
      file: 'src/data/build-orders/fast-castle-boom.json',
      path: '/license',
      format: 'source-text',
      valueSha256: '624f4dae4528cf46c931b8f79bdbfa33fc41f278217a2044b640ef1600d845f5',
    },
    {
      file: 'src/data/build-orders/fast-castle-boom.json',
      path: '/sources/0/ref',
      format: 'source-text',
      valueSha256: '7329e5fec835f6ef00fc954dcbe22529f520edb53c45e2c0def3436db4b65d3f',
    },
    {
      file: 'src/data/build-orders/fast-castle-boom.json',
      path: '/sources/0/section',
      format: 'source-text',
      valueSha256: '292d2914c199cf4a77606d7911bc686429eeaf6dc7f0cc9475d1eee211deb400',
    },
    {
      file: 'src/data/build-orders/fast-castle-knights.json',
      path: '/license',
      format: 'source-text',
      valueSha256: '1f12120d56c55801fbe4555ed37aaa9d5f86eb1140f7ebefd5107edab96334a9',
    },
    {
      file: 'src/data/build-orders/fast-castle-knights.json',
      path: '/sources/0/ref',
      format: 'source-text',
      valueSha256: '7329e5fec835f6ef00fc954dcbe22529f520edb53c45e2c0def3436db4b65d3f',
    },
    {
      file: 'src/data/build-orders/fast-castle-knights.json',
      path: '/sources/0/section',
      format: 'source-text',
      valueSha256: '292d2914c199cf4a77606d7911bc686429eeaf6dc7f0cc9475d1eee211deb400',
    },
    {
      file: 'src/data/build-orders/feudal-drush-18.json',
      path: '/license',
      format: 'source-text',
      valueSha256: '624f4dae4528cf46c931b8f79bdbfa33fc41f278217a2044b640ef1600d845f5',
    },
    {
      file: 'src/data/build-orders/feudal-drush-18.json',
      path: '/sources/0/ref',
      format: 'source-text',
      valueSha256: '7329e5fec835f6ef00fc954dcbe22529f520edb53c45e2c0def3436db4b65d3f',
    },
    {
      file: 'src/data/build-orders/feudal-drush-18.json',
      path: '/sources/0/section',
      format: 'source-text',
      valueSha256: '34a1bcf9e4193a5e2c3c532cc9827a2bb800973fe0d9d8b058a653c0570c9159',
    },
    {
      file: 'src/data/build-orders/maa-archers-18.json',
      path: '/license',
      format: 'source-text',
      valueSha256: '624f4dae4528cf46c931b8f79bdbfa33fc41f278217a2044b640ef1600d845f5',
    },
    {
      file: 'src/data/build-orders/maa-archers-18.json',
      path: '/sources/0/ref',
      format: 'source-text',
      valueSha256: '7329e5fec835f6ef00fc954dcbe22529f520edb53c45e2c0def3436db4b65d3f',
    },
    {
      file: 'src/data/build-orders/maa-archers-18.json',
      path: '/sources/0/section',
      format: 'source-text',
      valueSha256: '6f208afd79a4e116a48978befaac068f09f8b31c29bb8f93c546f36b15bc26da',
    },
    {
      file: 'src/data/build-orders/scouts-18.json',
      path: '/license',
      format: 'source-text',
      valueSha256: '624f4dae4528cf46c931b8f79bdbfa33fc41f278217a2044b640ef1600d845f5',
    },
    {
      file: 'src/data/build-orders/scouts-18.json',
      path: '/sources/0/ref',
      format: 'source-text',
      valueSha256: '7329e5fec835f6ef00fc954dcbe22529f520edb53c45e2c0def3436db4b65d3f',
    },
    {
      file: 'src/data/build-orders/scouts-18.json',
      path: '/sources/0/section',
      format: 'source-text',
      valueSha256: '2ddd5267bbae55c3ab0b930b502faad00b88a2366bacc9422980a1d0bbb8e621',
    },
    {
      file: 'src/content/game-guide.json',
      path: '/sources/pinned-techs/version',
      format: 'source-text',
      valueSha256: 'ea8e5e98abd373bc92444ca852f63a493695fbb4e9325acf64c476182028c1f8',
    },
  ].map((entry) => Object.freeze(entry)),
);
