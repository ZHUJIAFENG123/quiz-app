const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 种子案件数据
const SEED_CASES = [
  {
    title: '便利店的午夜黑影',
    description: '某日凌晨3点，一家便利店发生盗窃。你作为办案民警赶到现场...',
    category: '刑法',
    difficulty: 1,
    scenes: JSON.stringify([
      {
        id: 1,
        narrative: '凌晨3:15，你接到报警赶到现场。便利店玻璃门被砸碎，收银台现金丢失约3000元。店主称监控拍到一名穿黑色连帽衫的男子，但画面模糊无法辨认面容。',
        question: '作为出警民警，你到达现场后的第一步应该做什么？',
        choices: [
          { key: 'A', text: '立即调取周边所有监控录像', is_correct: false, feedback: '保护现场是首要任务，应在封锁现场后再进行证据收集。', law_ref: '《公安机关办理刑事案件程序规定》第192条' },
          { key: 'B', text: '封锁现场，疏散围观群众，保护现场痕迹', is_correct: true, feedback: '正确！到达现场后首要任务是保护现场，防止证据被破坏，然后通知刑侦技术人员勘验。', law_ref: '《公安机关办理刑事案件程序规定》第192条' },
          { key: 'C', text: '立即询问店主损失金额并立案', is_correct: false, feedback: '应先保护现场再进行询问。立案需要经审查认为有犯罪事实需要追究刑事责任。', law_ref: '《刑事诉讼法》第112条' }
        ]
      },
      {
        id: 2,
        narrative: '现场保护完毕，刑侦技术人员在收银台提取到一枚新鲜指纹。同时你在走访中得知：隔壁网吧老板称当晚有一个穿黑帽衫的年轻人来过，此人曾因盗窃被处理过，名叫张某某。',
        question: '根据现有证据，你对张某某可以采取什么措施？',
        choices: [
          { key: 'A', text: '直接逮捕张某某，因为他有前科', is_correct: false, feedback: '有前科不等于有犯罪事实，不能仅凭前科和推测就采取强制措施，需要有证据证明其涉嫌犯罪。', law_ref: '《刑事诉讼法》第81条' },
          { key: 'B', text: '传唤张某某到派出所接受讯问，同时进行指纹比对', is_correct: true, feedback: '正确！现有线索（目击+前科）构成合理怀疑，可以传唤配合调查。传唤时间不超过12小时，案情特别复杂的可延长至24小时。', law_ref: '《刑事诉讼法》第119条' },
          { key: 'C', text: '等指纹比对结果出来再说，现在什么也不做', is_correct: false, feedback: '消极等待不符合侦查原则。应当主动开展调查取证，传唤并不以指纹比对结果完成为前提。', law_ref: '《刑事诉讼法》第115条' }
        ]
      },
      {
        id: 3,
        narrative: '张某某被传唤到派出所。他声称当晚一直在出租屋睡觉，没有外出。但你调取了他的手机基站位置信息，显示当晚2:40-3:30他的手机信号出现在便利店周边区域。张某某改口说出门买烟，但否认盗窃。此时指纹比对结果出来：收银台上的指纹与张某某匹配。',
        question: '目前证据是否达到逮捕条件？',
        choices: [
          { key: 'A', text: '是，指纹+基站位置+前后矛盾供述，证据充分', is_correct: true, feedback: '正确！物证（指纹）、电子数据（基站位置）、言辞证据（矛盾供述）形成完整证据链，有证据证明犯罪事实且可能判处徒刑以上，有逮捕必要。', law_ref: '《刑事诉讼法》第81条' },
          { key: 'B', text: '否，缺少直接目击证人和赃物', is_correct: false, feedback: '逮捕不要求全部证据到位，只要有证据证明有犯罪事实即可。指纹和基站位置已经构成有力证据。', law_ref: '《刑事诉讼法》第81条' },
          { key: 'C', text: '可以提请批准逮捕，但检察院大概率不批', is_correct: false, feedback: '指纹是直接物证，基站位置是间接证据，两者相互印证已形成证据链。检察院批准逮捕的可能性很高。', law_ref: '《公安机关办理刑事案件程序规定》第133条' }
        ]
      },
      {
        id: 4,
        narrative: '最终张某某在证据面前交代了犯罪事实，并供述还有一名同伙在逃。根据张某某提供的线索，你在隔壁城市的一家小旅馆里找到了同伙李某某。李某某被抓获时正在用失窃的现金购买毒品。',
        question: '对李某某的抓捕适用什么程序？',
        choices: [
          { key: 'A', text: '拘留：因为有证据证明其涉嫌盗窃，且有逃跑可能', is_correct: true, feedback: '正确！李某某系现行犯（持有赃物），且有同案犯供述指认，符合先行拘留条件：正在预备犯罪/实行犯罪/犯罪后即时被发觉+有逃跑可能。', law_ref: '《刑事诉讼法》第82条' },
          { key: 'B', text: '只能传唤，因为还没有讯问过他', is_correct: false, feedback: '对于现行犯或有证据证明的重大嫌疑分子，可以先行拘留，不需要先传唤。', law_ref: '《刑事诉讼法》第82条' },
          { key: 'C', text: '先跟踪观察，等证据更充分再抓', is_correct: false, feedback: '李某某持有赃物且有同案犯指认，证据已经充分。延迟抓捕可能导致其继续逃窜或销毁证据。', law_ref: '《公安机关办理刑事案件程序规定》第125条' }
        ]
      }
    ])
  },
  {
    title: '离婚后的秘密彩票',
    description: '王女士离婚后发现，前夫在婚内曾中过500万大奖却隐瞒。她能分到这笔钱吗？',
    category: '民法',
    difficulty: 2,
    scenes: JSON.stringify([
      {
        id: 1,
        narrative: '王女士与陈先生结婚8年，2023年6月协议离婚并办理了登记。离婚协议约定：房产归王女士，其他财产各自归各自所有，双方确认无其他共同财产。离婚后三个月，王女士从朋友口中得知：陈先生在2023年3月曾购买彩票中了500万元大奖，税后到手400万元，但陈先生从未向她提起这件事。',
        question: '陈先生中奖的400万元属于什么性质的财产？',
        choices: [
          { key: 'A', text: '陈先生个人财产，因为是离婚后王女士才知道的', is_correct: false, feedback: '财产性质以取得时间为准，不以知晓时间为准。婚姻存续期间取得的财产属于共同财产。', law_ref: '《民法典》第1062条' },
          { key: 'B', text: '夫妻共同财产，因为中奖发生在婚姻关系存续期间', is_correct: true, feedback: '正确！中奖发生在2023年3月，在离婚（6月）之前。婚姻存续期间一方取得的财产，除法定例外情形外属于夫妻共同财产。', law_ref: '《民法典》第1062条' },
          { key: 'C', text: '要看买彩票的钱是谁出的，如果是陈先生私房钱买的就是个人财产', is_correct: false, feedback: '即使购买彩票的资金来自一方个人财产，中奖所得一般也认定为共同财产，因为中奖本身具有偶然性，不宜简单按出资比例划分。', law_ref: '《民法典》第1062条、最高人民法院关于适用《民法典》婚姻家庭编的解释' }
        ]
      },
      {
        id: 2,
        narrative: '王女士找陈先生理论，要求分割这笔奖金。陈先生拒绝，理由是：① 离婚协议已经约定"其他财产各自归各自所有"，属于财产分割完毕；② 王女士当时不知道这件事，现在反悔没有依据。',
        question: '陈先生的抗辩理由成立吗？',
        choices: [
          { key: 'A', text: '成立，离婚协议具有法律约束力，王女士不能再主张', is_correct: false, feedback: '协议分割的是双方"已知"的财产。如果一方故意隐瞒重大共同财产，离婚协议中"其他财产"的条款不适用。', law_ref: '《民法典》第1092条' },
          { key: 'B', text: '不成立，陈先生隐瞒共同财产，王女士有权请求再次分割', is_correct: true, feedback: '正确！夫妻一方隐藏、转移、变卖、毁损、挥霍夫妻共同财产，或者伪造夫妻共同债务企图侵占另一方财产的，在离婚分割夫妻共同财产时，对该方可以少分或者不分。离婚后，另一方发现有上述行为的，可以向人民法院提起诉讼，请求再次分割。', law_ref: '《民法典》第1092条' },
          { key: 'C', text: '部分成立，奖金可以分割但只能分一小部分', is_correct: false, feedback: '法律明确规定隐瞒共同财产的一方可以少分或不分，不存在"只能分一小部分"的固定比例，需由法院根据具体情况裁量。', law_ref: '《民法典》第1092条' }
        ]
      },
      {
        id: 3,
        narrative: '王女士向法院起诉，请求分割400万元奖金。法院查明：陈先生确实在婚内中奖，且离婚时故意隐瞒。法院还需要考虑：离婚协议中王女士分得了房产（价值约200万元），陈先生分得了一辆车（价值约10万元）。',
        question: '法院最可能的判决结果是什么？',
        choices: [
          { key: 'A', text: '400万全部归王女士，因为陈先生隐瞒行为恶劣', is_correct: false, feedback: '少分或不分的惩罚手段需结合具体情节。全部剥夺不符合比例原则，法院通常会综合考虑双方财产分配情况。', law_ref: '《民法典》第1092条' },
          { key: 'B', text: '400万作为共同财产重新分割，且陈先生因隐瞒行为可少分', is_correct: true, feedback: '正确！首先确认400万为共同财产，然后基于陈先生的隐瞒行为，在分割时对其少分。法院会结合离婚时已有的财产分配情况（王女士已得200万房产）综合裁决。实践中通常会判给王女士较大部分。', law_ref: '《民法典》第1092条、第1087条' },
          { key: 'C', text: '驳回起诉，因为离婚协议已经生效且超过时效', is_correct: false, feedback: '请求再次分割的诉讼时效为3年，从发现之日起计算。王女士刚发现不久，在时效内。', law_ref: '《民法典》第188条、最高人民法院关于适用《民法典》婚姻家庭编的解释' }
        ]
      }
    ])
  },
  {
    title: '外卖小哥的交通事故',
    description: '外卖骑手送餐途中撞伤行人，谁来承担责任？平台、骑手还是保险公司？',
    category: '民法',
    difficulty: 2,
    scenes: JSON.stringify([
      {
        id: 1,
        narrative: '周五晚7点，外卖骑手小李接到平台派单，急于送餐。在十字路口闯红灯时，将正常过马路的张阿姨撞倒，造成张阿姨右腿骨折，医疗费预估8万元。小李是某外卖平台的"众包骑手"，每天通过APP接单，穿着平台统一制服，使用印有平台Logo的保温箱。',
        question: '小李与外卖平台之间属于什么法律关系？',
        choices: [
          { key: 'A', text: '劳动关系，小李是平台员工', is_correct: false, feedback: '众包骑手通常未签订劳动合同，没有固定工资、社保等，不完全符合劳动关系的构成要件。但司法实践中各地判决不一，部分法院倾向于认定劳动关系。', law_ref: '《劳动合同法》第7条、劳社部发[2005]12号' },
          { key: 'B', text: '合作关系/劳务关系，但平台需对用户承担一定的管理责任', is_correct: true, feedback: '正确！目前主流司法观点认为众包骑手与平台之间属于新型用工关系。但平台作为组织者和管理者，对骑手执行配送任务过程中的侵权行为应当承担相应责任。', law_ref: '《民法典》第1191条、第1192条' },
          { key: 'C', text: '没有任何关系，外卖平台是纯技术中介', is_correct: false, feedback: '平台不仅仅是技术中介。平台对骑手有派单、定价、考核、奖惩等管理行为，超出了纯技术中介的范围。', law_ref: '《民法典》第1194条、《电子商务法》第38条' }
        ]
      },
      {
        id: 2,
        narrative: '交警认定：小李闯红灯负事故全部责任。张阿姨家属要求赔偿医疗费8万元、护理费2万元、误工费3万元、精神损害抚慰金2万元，总计15万元。外卖平台称：小李是众包骑手，平台与他是独立合作关系，应由小李个人赔偿。小李称：我在送餐途中出事，平台应当负责。而且平台为我们购买了意外险。',
        question: '张阿姨的损失应该由谁来赔偿？',
        choices: [
          { key: 'A', text: '仅由小李个人赔偿，因为是他闯红灯的直接过错', is_correct: false, feedback: '小李固然有直接过错，但他在执行平台派单任务时发生事故，属于"执行工作任务"。用人单位的工作人员因执行工作任务造成他人损害的，由用人单位承担侵权责任。', law_ref: '《民法典》第1191条' },
          { key: 'B', text: '平台承担赔偿责任，因为事故发生在配送过程中', is_correct: true, feedback: '正确！平台作为用工单位，对骑手在配送过程中造成的损害应承担替代责任。平台赔偿后，可以向有故意或重大过失的骑手追偿。平台投保的意外险也应先行赔付。', law_ref: '《民法典》第1191条' },
          { key: 'C', text: '平台和骑手各赔一半', is_correct: false, feedback: '对外部受害人而言，由用人单位对外承担全部赔偿责任。内部追偿是平台与骑手之间的事情。', law_ref: '《民法典》第1191条' }
        ]
      },
      {
        id: 3,
        narrative: '案件进入诉讼阶段。法院查明：① 平台为骑手购买了意外险，保额10万元；② 骑手在事发前已被平台系统连续警告3次超时，为了不被罚款而冒险闯红灯；③ 平台派单系统将预计送达时间设置过短，小李这一单只有15分钟但路程需要20分钟。',
        question: '这些新事实对责任认定有什么影响？',
        choices: [
          { key: 'A', text: '平台系统设置不合理属于算法过错，应加重平台责任', is_correct: true, feedback: '正确！平台通过算法不合理压缩配送时间，实质上引导了骑手违规行为。这种情况下平台应承担更重的责任，对骑手的追偿也应受到限制。', law_ref: '《民法典》第1173条、第1191条' },
          { key: 'B', text: '没有影响，骑手闯红灯是自己的选择', is_correct: false, feedback: '平台算法的压迫性设置是事故发生的间接原因。虽然骑手有自主选择权，但平台通过考核惩罚机制制造了不得不违规的困境。', law_ref: '《民法典》第1173条' },
          { key: 'C', text: '保险公司应全额赔付15万，平台和骑手都不用赔', is_correct: false, feedback: '意外险保额只有10万元，超出部分仍需责任方承担。而且意外险赔付不影响侵权责任的认定。', law_ref: '《保险法》相关条款' }
        ]
      }
    ])
  },
  {
    title: '朋友圈里的诽谤',
    description: '李某因不满被公司辞退，在朋友圈发布了大量侮辱前公司老板的内容。老板该如何维权？',
    category: '民法',
    difficulty: 1,
    scenes: JSON.stringify([
      {
        id: 1,
        narrative: '李某被某科技公司辞退后怀恨在心，于当晚在微信朋友圈发布了一条动态，称公司老板王某"靠行贿起家""吃人血馒头""拖欠员工工资黑心资本家"。此条动态被李某的500多位微信好友看到，并有30多人转发。王某因此受到了大量质疑，合作方也开始询问情况，王某经营的另一家公司因此失去了两个合作项目。',
        question: '李某的行为侵犯了王某的什么权利？',
        choices: [
          { key: 'A', text: '仅侵犯隐私权', is_correct: false, feedback: '李某公开发布内容，涉及的并非王某的私密信息，而是对王某的公开名誉攻击。', law_ref: '《民法典》第1032条' },
          { key: 'B', text: '侵犯名誉权，属于网络诽谤', is_correct: true, feedback: '正确！李某捏造事实（行贿、黑心等）并通过网络公开传播，导致王某社会评价降低并造成经济损失，构成对名誉权的侵害。', law_ref: '《民法典》第1024条、第1025条' },
          { key: 'C', text: '没有侵权，朋友圈属于言论自由范畴', is_correct: false, feedback: '言论自由有边界。捏造事实、公开侮辱他人不属于言论自由的保护范围，朋友圈不是法外之地。', law_ref: '《宪法》第35条、《民法典》第1024条' }
        ]
      },
      {
        id: 2,
        narrative: '王某决定采取法律手段。他已经截图保存了李某的朋友圈动态及转发记录，并计算了因合作项目损失造成的经济损失约30万元。',
        question: '王某应该通过什么途径维权？',
        choices: [
          { key: 'A', text: '直接报警，要求公安机关以诽谤罪立案', is_correct: false, feedback: '诽谤罪一般属于自诉案件（严重危害社会秩序和国家利益的除外）。民事维权可以通过法院诉讼，刑事自诉可以同时或单独提起。', law_ref: '《刑法》第246条、《治安管理处罚法》第42条' },
          { key: 'B', text: '向法院提起名誉权侵权诉讼，要求停止侵害+赔偿+道歉', is_correct: true, feedback: '正确！可以提起民事诉讼要求：① 停止侵害（删除朋友圈）；② 赔礼道歉、消除影响；③ 赔偿经济损失和精神损害。同时可申请诉前证据保全，防止李某删除证据。', law_ref: '《民法典》第995条、第1183条' },
          { key: 'C', text: '找微信平台投诉，要求封掉李某的账号就行了', is_correct: false, feedback: '平台投诉是辅助手段。对于已经造成的名誉损害和经济损失，需要法律程序来补救。仅封号不能弥补已经造成的损失。', law_ref: '《民法典》第1195条' }
        ]
      },
      {
        id: 3,
        narrative: '法院立案后，李某辩称：内容属实，王某确实有拖欠工资的行为（经查：工资已于离职时结清，但有约5000元加班费争议正在劳动仲裁中）。李某还称转发的人不是他控制的，不该由他负责。',
        question: '李某的抗辩能否成立？',
        choices: [
          { key: 'A', text: '可以，有加班费争议说明"拖欠工资"不完全是捏造', is_correct: false, feedback: '将5000元加班费争议夸大为"黑心资本家拖欠工资"并加上"行贿起家""吃人血馒头"等侮辱性言论，已经超出了事实描述的范围。', law_ref: '《民法典》第1025条' },
          { key: 'B', text: '不能成立，言论中有大量捏造和侮辱内容，超出合理评价范围', is_correct: true, feedback: '正确！"行贿起家""吃人血馒头"等属于捏造事实，"黑心资本家"属于侮辱性言论。至于转发者，李某作为信息发布者，对信息的传播负有责任。', law_ref: '《民法典》第1024条、第1025条' },
          { key: 'C', text: '转发者的问题与李某无关，李某只对原创内容负责', is_correct: false, feedback: '在网络环境下，信息发布者应当预见到内容可能被传播，由此产生的扩大影响属于可预见后果。', law_ref: '《民法典》第1194条、第1195条' }
        ]
      }
    ])
  },
  {
    title: '醉酒后的"自愿"',
    description: '某KTV聚会后，醉酒的女生被同行男子带走并发生关系。第二天女生报警称被强奸...',
    category: '刑法',
    difficulty: 3,
    scenes: JSON.stringify([
      {
        id: 1,
        narrative: '周五晚，大学生小玲（20岁）参加同学生日聚会。在KTV中，她被劝喝了大量酒，到凌晨1点时已处于严重醉酒状态——走路需要搀扶、言语不清、意识模糊。同班男生小周主动提出送她回宿舍。但小周没有将小玲送回学校，而是带到了校外的快捷酒店，并与小玲发生了性关系。第二天小玲醒来后发现自己身在酒店且被侵害，立即报警。',
        question: '本案的核心法律争议是什么？',
        choices: [
          { key: 'A', text: '两人是否属于恋爱关系', is_correct: false, feedback: '即便是恋爱关系，也不能在对方醉酒无意识的情况下发生性关系。核心问题是"是否违背妇女意志"。', law_ref: '《刑法》第236条' },
          { key: 'B', text: '醉酒状态下的"同意"是否有效', is_correct: true, feedback: '正确！核心在于严重醉酒状态下，被害人是否具有性同意的能力。如果因醉酒而不知反抗、不能反抗，即使表面没有暴力痕迹，也构成违背意志。', law_ref: '《刑法》第236条、最高法关于常见犯罪的量刑指导意见' },
          { key: 'C', text: '小周有没有使用暴力手段', is_correct: false, feedback: '强奸罪的构成不限于暴力手段。利用被害人醉酒、昏迷等不知反抗、不能反抗的状态，同样可以构成强奸罪。', law_ref: '《刑法》第236条' }
        ]
      },
      {
        id: 2,
        narrative: '警方介入调查。小周辩称：① 小玲没有反抗，也没有说"不"；② 小玲自己同意去的酒店；③ KTV的监控显示小玲还和小周有说有笑。但司法鉴定报告显示：小玲事发时血液酒精含量约为200mg/100ml，属于严重醉酒状态。同行同学证实：小玲离开时已经"站不稳，说话含糊"。',
        question: '根据现有证据，小周的行为是否构成强奸罪？',
        choices: [
          { key: 'A', text: '不构成，因为小玲没有反抗也没有拒绝', is_correct: false, feedback: '严重醉酒状态下，被害人"不能反抗"而非"不想反抗"。法律保护的正是这种状态下被侵害的对象。', law_ref: '《刑法》第236条' },
          { key: 'B', text: '构成强奸罪，利用被害人醉酒不能反抗的状态趁人之危', is_correct: true, feedback: '正确！200mg/100ml属于严重醉酒，该状态下认知和判断能力严重受损，不具备有效的性同意能力。小周明知小玲醉酒并利用这一状态，构成强奸罪。', law_ref: '《刑法》第236条' },
          { key: 'C', text: '证据不足，真相无法判断', is_correct: false, feedback: '证据链已足够：① 鉴定报告证明严重醉酒；② 证人证明小玲意识不清；③ 小周自认发生了性关系；④ KTV监控+酒店入住记录相互印证。', law_ref: '《刑事诉讼法》第55条' }
        ]
      },
      {
        id: 3,
        narrative: '检察机关以强奸罪对小周提起公诉。法院审理中发现：小周家在案发后主动赔偿小玲20万元，并取得了小玲的谅解书。小周在校期间表现良好，无前科。小周律师请求适用缓刑。',
        question: '法院对小周的量刑应如何考量？',
        choices: [
          { key: 'A', text: '因为有谅解书和赔偿，可以不追究刑事责任', is_correct: false, feedback: '强奸罪属于公诉案件，被害人的谅解不影响定罪，只影响量刑。且利用醉酒状态的方式，性质较为恶劣。', law_ref: '《刑法》第236条' },
          { key: 'B', text: '构成强奸罪，基准刑3年以上，可因谅解+赔偿+悔罪适当从轻，但不可适用缓刑', is_correct: true, feedback: '正确！强奸罪法定刑为3年以上10年以下有期徒刑。赔偿、谅解、悔罪、无前科均可作为从轻情节。但本案利用严重醉酒状态实施侵害，情节较重，一般不宜适用缓刑。实际量刑可能在3-5年。', law_ref: '《刑法》第236条、第72条' },
          { key: 'C', text: '可以判缓刑，因为小周是学生且已赔偿', is_correct: false, feedback: '缓刑的适用条件是被判处拘役或3年以下有期徒刑，且犯罪情节较轻、有悔罪表现、没有再犯危险。本案情节较重（利用严重醉酒状态），通常不符合"犯罪情节较轻"的要件。', law_ref: '《刑法》第72条' }
        ]
      }
    ])
  }
];

// ===== 初始化案件表 =====
function initCaseTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      difficulty INTEGER DEFAULT 1,
      scenes TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS case_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      case_id INTEGER NOT NULL,
      current_scene INTEGER DEFAULT 0,
      score INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      choices TEXT DEFAULT '[]',
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, case_id)
    );
  `);

  const count = db.prepare('SELECT COUNT(*) as count FROM case_stories').get();
  if (count.count === 0) {
    const insert = db.prepare(
      'INSERT INTO case_stories (title, description, category, difficulty, scenes) VALUES (?, ?, ?, ?, ?)'
    );
    for (const c of SEED_CASES) {
      insert.run(c.title, c.description, c.category, c.difficulty, c.scenes);
    }
    console.log(`[案件] 已导入 ${SEED_CASES.length} 个案件故事`);
  }
}

// ===== 获取案件列表 =====
router.get('/', (req, res) => {
  try {
    initCaseTables();
    const userId = req.userId || 0;
    const cases = db.prepare(`
      SELECT cs.*, cp.score, cp.completed, cp.current_scene
      FROM case_stories cs
      LEFT JOIN case_progress cp ON cs.id = cp.case_id AND cp.user_id = ?
      ORDER BY cs.difficulty ASC, cs.id ASC
    `).all(userId);

    res.json({
      success: true,
      data: cases.map(c => ({
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        difficulty: c.difficulty,
        totalScenes: JSON.parse(c.scenes).length,
        score: c.score || 0,
        completed: !!c.completed,
        currentScene: c.current_scene || 0
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 获取案件详情（含用户进度） =====
router.get('/:id', (req, res) => {
  try {
    initCaseTables();
    const userId = req.userId || 0;
    const caseStory = db.prepare('SELECT * FROM case_stories WHERE id = ?').get(req.params.id);
    if (!caseStory) return res.status(404).json({ success: false, message: '案件不存在' });

    let progress = db.prepare('SELECT * FROM case_progress WHERE case_id = ? AND user_id = ?')
      .get(caseStory.id, userId);

    if (!progress) {
      db.prepare('INSERT INTO case_progress (user_id, case_id) VALUES (?, ?)').run(userId, caseStory.id);
      progress = { current_scene: 0, score: 0, completed: 0, choices: '[]' };
    }

    const scenes = JSON.parse(caseStory.scenes);
    const currentIdx = progress.current_scene || 0;
    const currentScene = scenes[currentIdx] || null;

    res.json({
      success: true,
      data: {
        id: caseStory.id,
        title: caseStory.title,
        description: caseStory.description,
        category: caseStory.category,
        difficulty: caseStory.difficulty,
        totalScenes: scenes.length,
        currentScene: currentIdx,
        scene: currentScene ? {
          id: currentScene.id,
          narrative: currentScene.narrative,
          question: currentScene.question,
          choices: currentScene.choices.map(c => ({ key: c.key, text: c.text }))
        } : null,
        score: progress.score || 0,
        completed: !!progress.completed,
        previousChoices: JSON.parse(progress.choices || '[]')
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 提交判断 =====
router.post('/:id/judge', (req, res) => {
  try {
    initCaseTables();
    const userId = req.userId || 0;
    const { choice } = req.body;

    if (!choice) return res.status(400).json({ success: false, message: '请选择答案' });

    const caseStory = db.prepare('SELECT * FROM case_stories WHERE id = ?').get(req.params.id);
    if (!caseStory) return res.status(404).json({ success: false, message: '案件不存在' });

    let progress = db.prepare('SELECT * FROM case_progress WHERE case_id = ? AND user_id = ?')
      .get(caseStory.id, userId);
    if (!progress) {
      db.prepare('INSERT INTO case_progress (user_id, case_id) VALUES (?, ?)').run(userId, caseStory.id);
      progress = { current_scene: 0, score: 0, completed: 0, choices: '[]' };
    }

    const scenes = JSON.parse(caseStory.scenes);
    const currentIdx = progress.current_scene || 0;
    const currentScene = scenes[currentIdx];
    if (!currentScene) return res.status(400).json({ success: false, message: '案件已结束' });

    const selected = currentScene.choices.find(c => c.key === choice);
    if (!selected) return res.status(400).json({ success: false, message: '无效选择' });

    const isCorrect = selected.is_correct;
    const score = (progress.score || 0) + (isCorrect ? 1 : 0);
    const prevChoices = JSON.parse(progress.choices || '[]');
    prevChoices.push({
      sceneId: currentScene.id,
      choice: selected.key,
      isCorrect,
      feedback: selected.feedback,
      lawRef: selected.law_ref
    });

    const isLast = currentIdx >= scenes.length - 1;
    const newScene = isLast ? currentIdx + 1 : currentIdx + 1;

    db.prepare(`
      UPDATE case_progress SET current_scene = ?, score = ?, completed = ?, choices = ?, completed_at = ?
      WHERE case_id = ? AND user_id = ?
    `).run(
      newScene, score, isLast ? 1 : 0, JSON.stringify(prevChoices),
      isLast ? new Date().toISOString() : null,
      caseStory.id, userId
    );

    res.json({
      success: true,
      data: {
        isCorrect,
        score,
        totalScenes: scenes.length,
        currentScene: newScene,
        completed: isLast,
        feedback: selected.feedback,
        lawRef: selected.law_ref,
        correctAnswer: currentScene.choices.find(c => c.is_correct)?.key || ''
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ===== 重置案件进度 =====
router.post('/:id/reset', (req, res) => {
  try {
    const userId = req.userId || 0;
    db.prepare('DELETE FROM case_progress WHERE case_id = ? AND user_id = ?')
      .run(req.params.id, userId);
    res.json({ success: true, message: '已重置' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { router, initCaseTables };
