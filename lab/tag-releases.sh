#!/bin/sh
# Tags every UEC release from v1.7, each at the version as it was live on the
# site (from GitHub's "pages build and deployment" history; v3.9.2 and v3.12
# were never deployed on their own and are tagged at their last commit). Run
# once, from a checkout of the repository with `main` pulled, then push the
# tags:
#
#   git pull && sh lab/tag-releases.sh && git push origin --tags
#
# Written on 2026-11-15, from a session whose connection could push branches
# but not tags. A tag that already exists is left as it is. New releases are
# tagged one at a time (ONBOARDING section 7).
set -e
tag() {
  if git rev-parse -q --verify "refs/tags/$1" >/dev/null; then
    echo "$1 is already tagged"
  else
    GIT_COMMITTER_DATE="$3" git tag -a "$1" "$2" -m "$4"
    echo "$1 tagged"
  fi
}
tag v1.7 3f3222e055fcbea2b95136d90f63cf38bc04c982 2026-07-23T03:34:37+00:00 'UEC v1.7, as it was live on the site (deployed 2026-07-22).'
tag v1.8 835372bfd844f3b6e1bd3243bb574fcee7c49d6c 2026-07-23T04:12:35+00:00 'UEC v1.8, as it was live on the site (deployed 2026-07-23).'
tag v1.9 94cf22eeb0461a5fcddc8e50117c12352ad21545 2026-07-23T12:39:03+00:00 'UEC v1.9, as it was live on the site (deployed 2026-07-23).'
tag v2.0 d190a695a27c2ff6de44a18c2e5d39ba3d91cf32 2026-07-25T23:22:28+00:00 'UEC v2.0, as it was live on the site (deployed 2026-07-25).'
tag v2.1 8472b4af13e53ffe451eb938d6383aa11dacc532 2026-07-27T14:07:15+00:00 'UEC v2.1, as it was live on the site (deployed 2026-07-27).'
tag v2.2 194c9e1fef472be398b298424556d63606ec4261 2026-07-28T15:04:55+00:00 'UEC v2.2, as it was live on the site (deployed 2026-07-28).'
tag v2.3 bf2ecdc4cf0f64118ee62947a71997352d2638a6 2026-07-29T15:51:08+00:00 'UEC v2.3, as it was live on the site (deployed 2026-07-29).'
tag v2.3.1 5284be0ccabcd07355bc7943f03f2b2fd6564194 2026-07-29T16:21:32+00:00 'UEC v2.3.1, as it was live on the site (deployed 2026-07-29).'
tag v2.4 eaa26af122c2359335830969d3f0fdf112366209 2026-08-01T17:28:42+00:00 'UEC v2.4, as it was live on the site (deployed 2026-08-01).'
tag v2.5 84c5455ca3910c9b668f5efe10e5cd0f0664f6da 2026-08-02T01:22:52+00:00 'UEC v2.5, as it was live on the site (deployed 2026-08-01).'
tag v2.6 e9913c592d028a0a9ed52498284460dc30bb93c8 2026-08-02T03:57:20+00:00 'UEC v2.6, as it was live on the site (deployed 2026-08-01).'
tag v2.7 e50b6fbbe0dd388a5b971ce05cb23ce81b57fea7 2026-08-02T10:42:35+00:00 'UEC v2.7, as it was live on the site (deployed 2026-08-02).'
tag v2.8 8974fc81c544cdc3042314cbef729e4987f9f26a 2026-08-02T17:36:36+00:00 'UEC v2.8, as it was live on the site (deployed 2026-08-02).'
tag v2.9 9bde7a8e737e85d482eeaa2bcc667684850497da 2026-08-02T18:59:28+00:00 'UEC v2.9, as it was live on the site (deployed 2026-08-02).'
tag v3.0 ed496edf2fd8f7f75949c984a6e25b4161016ca1 2026-08-02T23:30:01+00:00 'UEC v3.0, as it was live on the site (deployed 2026-08-02).'
tag v3.1 c82aa143c517a4a6fb540cca4f5d7cd21c72b24c 2026-08-04T17:58:12+00:00 'UEC v3.1, as it was live on the site (deployed 2026-08-04).'
tag v3.2 8656c74131074d260dd3ceb4b7d298cc2f1705da 2026-08-05T10:55:06+00:00 'UEC v3.2, as it was live on the site (deployed 2026-08-05).'
tag v3.3 119c3dc816425701fc5606807b5e33c8cad5ee39 2026-08-06T00:12:17+00:00 'UEC v3.3, as it was live on the site (deployed 2026-08-05).'
tag v3.4 b35a05c26cbee002c0028a517d6409305584be60 2026-08-14T18:56:58+00:00 'UEC v3.4, as it was live on the site (deployed 2026-08-14).'
tag v3.5 7d74ee3da75bae03317211b111666a75f6f18db8 2026-08-15T17:41:10+00:00 'UEC v3.5, as it was live on the site (deployed 2026-08-15).'
tag v3.6 2562e5b1962e718d14e4adaf3c64688b03bd9099 2026-08-15T18:34:08+00:00 'UEC v3.6, as it was live on the site (deployed 2026-08-15).'
tag v3.7 76d70fcb80e0a238e0d36c80acf009147c79bca7 2026-08-15T19:18:44+00:00 'UEC v3.7, as it was live on the site (deployed 2026-08-15).'
tag v3.8 8e89ff304d3494795c67cbab7cd321cc9cc0fa34 2026-10-05T22:20:28+00:00 'UEC v3.8, as it was live on the site (deployed 2026-10-05).'
tag v3.9 8d188a8d820554967d2f3150a6526f4fc992be50 2026-10-26T02:33:42+00:00 'UEC v3.9, as it was live on the site (deployed 2026-10-25).'
tag v3.9.1 5a22d62c09ea0ebb5f5d4517672edb44a24e87f4 2026-10-26T03:08:20+00:00 'UEC v3.9.1, as it was live on the site (deployed 2026-10-25).'
tag v3.9.2 d25f4b3f2c29f28dcd8a60cc4812cae3613d26b6 2026-10-25T23:36:29-04:00 'UEC v3.9.2: never deployed on its own (the next version went out with it); the last commit at this version.'
tag v3.9.3 9ce0559848822027be0f014782f377e822bf752c 2026-10-26T13:08:51+00:00 'UEC v3.9.3, as it was live on the site (deployed 2026-10-26).'
tag v3.9.4 c6e1be3fc01dc9b715728074d38df8c26c4813a2 2026-10-28T20:31:12+00:00 'UEC v3.9.4, as it was live on the site (deployed 2026-10-28).'
tag v3.10 41bc1f655f5d01fa142d57929c2fa60fa8dde248 2026-10-29T05:08:06+00:00 'UEC v3.10, as it was live on the site (deployed 2026-10-29).'
tag v3.10.1 3d9060f0106b362fbaf2430c41e69bd334483f3b 2026-10-29T05:30:51+00:00 'UEC v3.10.1, as it was live on the site (deployed 2026-10-29).'
tag v3.10.2 9c924eddcadeb4ba75006f1afc203c7f49479fbf 2026-10-29T13:12:22+00:00 'UEC v3.10.2, as it was live on the site (deployed 2026-10-29).'
tag v3.11 4b4e916b437034bef8014233069a5fbdf8035adb 2026-10-29T13:28:19+00:00 'UEC v3.11, as it was live on the site (deployed 2026-10-29).'
tag v3.12 e1f19cc1765403a5869095f98e0ea40b12a7e1f5 2026-11-04T23:07:03-05:00 'UEC v3.12: never deployed on its own (the next version went out with it); the last commit at this version.'
tag v3.13 2cc5f37da4b61e5b7c85d38f9d517e07c03026f0 2026-11-05T13:22:37+00:00 'UEC v3.13, as it was live on the site (deployed 2026-11-05).'
tag v3.14 93598e4a497429031682002976a3f3e29d116f9a 2026-11-05T14:19:10+00:00 'UEC v3.14, as it was live on the site (deployed 2026-11-05).'
tag v3.15 79cff5d0bb06c3660e4a59415fea850054bf7f1e 2026-11-05T14:58:31+00:00 'UEC v3.15, as it was live on the site (deployed 2026-11-05).'
tag v3.16 ac5bb8e3e9c46de9bd6cf638ec51f0bb182878bf 2026-11-05T19:57:22+00:00 'UEC v3.16, as it was live on the site (deployed 2026-11-05).'
tag v3.17 8bc360ea381c74485943573a8cbc93e747ef1fd8 2026-11-05T23:13:14+00:00 'UEC v3.17, as it was live on the site (deployed 2026-11-05).'
tag v3.18 80669833aa4a63b1b99050f0eb65362d0e5a528a 2026-11-07T04:57:50+00:00 'UEC v3.18, as it was live on the site (deployed 2026-11-06).'
tag v3.19 f8102dff0939a926636d1bdc598878848cf0e041 2026-11-08T00:07:38+00:00 'UEC v3.19, as it was live on the site (deployed 2026-11-07).'
tag v3.20 b04b4f17c54cfef5d9a6397c4d8142a6feb7860f 2026-11-09T11:46:15+00:00 'UEC v3.20, as it was live on the site (deployed 2026-11-09).'
tag v3.21 7df89d05a9a77b370968f93783d46c73961143f9 2026-11-12T21:50:17+00:00 'UEC v3.21, as it was live on the site (deployed 2026-11-12).'
tag v3.21.1 9b17490d01298bbee6bfa488bd98b9dc72ac4d00 2026-11-14T04:18:46+00:00 'UEC v3.21.1, as it was live on the site (deployed 2026-11-13).'
tag v3.22 3c690ed55862e383602fe02e7278e68a61574f77 2026-11-14T18:43:04+00:00 'UEC v3.22, as it was live on the site (deployed 2026-11-14).'
tag v3.22.1 121f49cff98f163bc2290827b2fec0601eeb0f6d 2026-11-15T02:58:47+00:00 'UEC v3.22.1, as it was live on the site (deployed 2026-11-14).'
tag v3.22.2 63180b096649298794b7803b936c1080784ca069 2026-11-15T15:10:20+00:00 'UEC v3.22.2, as it was live on the site (deployed 2026-11-15).'
tag v3.22.3 e539fd44ab07d423a0120cf2134ddd0ea95dc72d 2026-11-15T18:24:24+00:00 'UEC v3.22.3, as it was live on the site (deployed 2026-11-15). The last release that played in 2D, as the fallback without WebGL2.'
tag v3.22.4 bf112c0d746b04389d41519a41317fece06fc40f 2026-11-15T19:14:47+00:00 'UEC v3.22.4, as it was live on the site (deployed 2026-11-15). The first release that is 3D only.'
tag v3.22.5 b18b9dba73ee37f33e75dcf737e3ee037e006eb4 2026-11-16T05:22:40+00:00 'UEC v3.22.5, as built (2026-11-16). Never deployed on its own: it went out inside v3.23.'
tag v3.23 5fb9d77ff78b19b99ad33d53351f31484737f65d 2026-11-18T02:48:23+00:00 'UEC v3.23, as released (2026-11-17): modelled light, the cast rebuilt, heights brought in.'
tag v3.23.1 db5279df35b07e85a8056906b5eb4f561bfa6961 2026-11-21T20:13:01+00:00 'UEC v3.23.1, as released (2026-11-21): the faces fixed.'
