const express = require('express')
const session = require('express-session')
const qs = require('qs')
const axios = require('axios')
const app = express()
app.use(express.static(__dirname))
app.use(express.json())
require('dotenv').config()

const port = process.env.PORT || 3000
const host = '0.0.0.0'

app.use(
  session({
    secret: "FRFKRQR9IVahOAfY88oWjNdOUdT8TrvN",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
)

const cors = require('cors')
app.use(cors())

const { spawn } = require('child_process')

const User = require('./models/user')
const Bet = require('./models/bet')

const client_id = "5089e08676bae2c4b65964f001a0fb20"
const client_secret = "FRFKRQR9IVahOAfY88oWjNdOUdT8TrvN"
const domain = "https://o-zoo-back.onrender.com"
const redirect_uri = `${domain}/redirect`
const token_uri = "https://kauth.kakao.com/oauth/token"
const api_host = "https://kapi.kakao.com"

const naver_client_id = "SW7l8ODtkdq9XuOJfXXg"
const naver_client_secret = "eYFxNIrcJ4"

const mongoose = require('mongoose')
const url = process.env.MONGODB_URL

mongoose.connect(url)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err))

async function call(method, uri, param, header) {
  let rtn;
  try {
    rtn = await axios({
      method: method,   
      url: uri,         
      headers: header,  // 요청 헤더 (예: Content-Type, Authorization 등)
      data: param,      // 전송할 요청 데이터 (body)
    });
  } catch (err) {
    rtn = err.response;
  }
  // 요청 성공 또는 실패에 상관없이 응답 데이터 반환
  return rtn.data;
}

function askGemini(question) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['./gemini.py', question])

    let result = ''
    let error = ''

    py.stdout.on('data', (data) => {
      result += data.toString()
    })

    py.stderr.on('data', (data) => {
      error += data.toString()
    })

    py.on('close', (code) => {
      if (code === 0) {
        resolve(result)
      } else {
        reject(error || `Python process exited with code ${code}`)
      }
    })
  })
}

app.get("/authorize", function (req, res) {
  // 선택: 사용자에게 추가 동의를 요청하는 경우, scope 값으로 동의항목 ID를 전달
  // 친구 목록, 메시지 전송 등 접근권한 요청 가능
  // (예: /authorize?scope=friends,talk_message)
  let { scope } = req.query;
  let scopeParam = "&scope=profile_nickname,profile_image,friends";
  if (scope) {
    scopeParam = "&scope=" + "profile_nickname,profile_image,friends";
  }

  // 카카오 인증 서버로 리다이렉트
  // 사용자 동의 후 리다이렉트 URI로 인가 코드가 전달
  res.status(302).redirect(
      `https://kauth.kakao.com/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code${scopeParam}`
  );
});

app.get("/redirect", async function (req, res) {
  // 인가 코드 발급 요청에 필요한 파라미터 구성
  const param = qs.stringify({
    grant_type: "authorization_code",   // 인증 방식 고정값
    client_id: client_id,               // 내 앱의 REST API 키
    redirect_uri: redirect_uri,         // 등록된 리다이렉트 URI
    code: req.query.code,               // 전달받은 인가 코드
    client_secret: client_secret,       // 선택: 클라이언트 시크릿(Client Secret) 사용 시 추가
  })

  // API 요청 헤더 설정
  const header = { "content-type": "application/x-www-form-urlencoded" }

  // 카카오 인증 서버에 액세스 토큰 요청
  const rtn = await call("POST", token_uri, param, header)

  // 발급받은 액세스 토큰을 세션에 저장 (로그인 상태 유지 목적)
  req.session.key = rtn.access_token
  req.session.refreshKey = rtn.refresh_token
  console.log(`redirection access token : ${rtn.access_token}, refresh token : ${rtn.refresh_token}`)

  // 로그인 완료 후 메인 페이지로 이동
  res.status(302).redirect(`ozoo://main?login=success&token=${rtn.access_token}&refresh=${rtn.refresh_token}&expires_in=${rtn.expires_in}`)
})

app.get("/refresh", async function (req, res) {
  // 인가 코드 발급 요청에 필요한 파라미터 구성
  const refreshToken = req.body.refreshToken;
  const param = qs.stringify({
    grant_type: "refresh_token",   // 인증 방식 고정값
    client_id: client_id,               // 내 앱의 REST API 키
    refresh_token: refreshToken,         // refresh Token
    client_secret: client_secret,       // 선택: 클라이언트 시크릿(Client Secret) 사용 시 추가
  })

  // API 요청 헤더 설정
  const header = { "content-type": "application/x-www-form-urlencoded" }

  // 카카오 인증 서버에 액세스 토큰 요청
  const rtn = await call("POST", 'https://kauth.kakao.com/oauth/token', param, header)
  console.log(`refresh, ${rtn}`)

  // 로그인 완료 후 메인 페이지로 이동
  res.json(rtn)
})

app.get("/profile", async function (req, res) {
  const auth = req.headers.authorization
  const token = auth ? auth.split(' ')[1] : null
  if(!token){
    return res.status(401).json({ code : -401, msg: "access token missing" })
  }
  const uri = api_host + "/v2/user/me"  // 사용자 정보 가져오기 API 주소
  const param = {}  // 사용자 정보 요청 시 파라미터는 필요 없음
  const header = {
    "content-type": "application/x-www-form-urlencoded",  // 요청 헤더 Content-Type 지정
    Authorization: "Bearer " + token,  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("POST", uri, param, header)  // 카카오 API에 요청 전송

  res.send(rtn)  // 조회한 사용자 정보를 클라이언트에 반환
})

app.get("/logout", async function (req, res) {
  const uri = api_host + "/v1/user/logout"  // 로그아웃 API 주소
  const header = {
    Authorization: "Bearer " + req.session.key  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("POST", uri, null, header)  // 카카오 API에 로그아웃 요청 전송
  req.session.destroy()  // 세션 삭제 (로그아웃 처리)
  res.send(rtn)  // 응답 결과 클라이언트에 반환
})

// 연결 끊기 요청: 사용자와 앱의 연결을 해제하고 세션 종료
app.get("/unlink", async function (req, res) {
  const uri = api_host + "/v1/user/unlink"  // 연결 끊기 API 주소
  const header = {
    Authorization: "Bearer " + req.session.key  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("POST", uri, null, header)  // 카카오 API에 연결 끊기 요청 전송
  req.session.destroy()  // 세션 삭제 (연결 해제 처리)
  res.send(rtn)  // 응답 결과 클라이언트에 반환
})

app.get('/', async (req, res) => {
  res.send('Server On')
})

app.post('/search/naver/product', async (req, res) => {
  try {
    const keyword = req.body.keyword || '잔망루피';  // 검색어 없을 때 기본값
    const api_url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=5`;

    const response = await axios.get(api_url, {
      headers: {
        'X-Naver-Client-Id': naver_client_id,
        'X-Naver-Client-Secret': naver_client_secret
      }
    });

    const data = response.data;
    const products = data.items.map(item => ({
      title: item.title.replace(/<[^>]+>/g, ''), // HTML 태그 제거
      image: item.image,
      link: item.link
    }));

    res.json({
      success: true,
      product_image:products[0].image
    });

  } catch (error) {
    console.error('API 에러:', error.message);
    res.status(500).json({
      success: false,
      message: '네이버 쇼핑 API 요청 실패',
      error: error.response ? error.response.data : error.message
    });
  }
});

app.get('/deleteUser', async (req, res) => {
  await User.deleteMany({})
  res.send('Deleted all users')
})

app.post("/api/user/register", async (req, res) => {
  try {
    const user = new User(req.body)
    await user.save()
    console.log(user)
    res.status(200).json({ success: true })
  } catch (err) {
    res.json({ success: false, err })
  }
})

app.post("/api/bet/register", async (req, res) => {
  if (!req.body.title || !req.body.content || !req.body.members || !req.body.end) {
    return res.status(400).json({ success: false, message: '필수 항목이 누락되었습니다.' })
  }
  const members = req.body.members
  const membersIn = await User.find({name: {$in: members}})
  const memberIds = membersIn.map(member => ({ id: member.id, name: member.name }))
  req.body.members = memberIds
  try {
    const bet = new Bet(req.body)
    await bet.save()
    console.log(bet)
    res.status(200).json({ success: true })
  } catch (err) {
    console.error('Bet registration error:', err)
    res.json({ success: false, err })
  }
})

app.post("/api/user/findById", async (req, res) => {
  try {
    const { id } = req.body
    if (!id) {
      return res.status(400).json({
        loginSuccess: false,
        message: "아이디를 입력하세요.",
      })
    }

    const user = await User.findOne({ id });
    if (!user) {
      return res.status(401).json({
        loginSuccess: false,
        message: "아이디가 존재하지 않습니다.",
      })
    }
    res
      .status(200)
      .json({ loginSuccess: true, id: user.id, name: user.name, profile_img: user.profile_img, score: user.score, exp: user.exp, birth: user.birth, wins: user.wins, losses: user.losses })
  } catch (err) {
    res.status(500).json({
      loginSuccess: false,
      message: "서버 오류가 발생했습니다.",
      error: err.message,
    })
  }
})

app.post("/api/bet/findByContent", async (req, res) => {
  try {
    const { content } = req.body
    if (!content) {
      return res.status(400).json({
        success: false,
        message: "내기를 입력하세요.",
      })
    }

    const bet = await Bet.findOne({ content });
    if (!bet) {
      return res.status(401).json({
        success: false,
        message: "내기가 존재하지 않습니다.",
      })
    }
    res
      .status(200)
      .json({ success: true, title: bet.title, content: bet.content, members: bet.members, price: bet.price, priceName:bet.price_name, winner: bet.winner, loser: bet.loser, start: bet.start, end: bet.end })
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      error: err.message,
    })
  }
})

app.post('/api/user/update', async (req, res) => {
  const id = req.body.id
  const exp = req.body.exp
  const score = req.body.score
  const wins = req.body.wins
  const losses = req.body.losses
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID를 입력하세요.' })
  }
  if (exp === undefined || exp === null) {
    return res.status(400).json({ success: false, message: '경험치를 입력하세요.' })
  }
  if (score === undefined || score === null) {
    return res.status(400).json({ success: false, message: '점수를 입력하세요.' })
  }
  if (wins === undefined || wins === null) {
    return res.status(400).json({ success: false, message: '승리횟수를 입력하세요.' })
  }
  if (losses === undefined || losses === null) {
    return res.status(400).json({ success: false, message: '패배횟수를 입력하세요.' })
  }

  try {
    const user = await User.findOne({ id: id })
    if (!user) {
      return res.status(404).json({ success: false, message: '등록된 아이디가 없습니다.' })
    }

    user.exp = exp
    user.score = score
    user.wins = wins
    user.losses = losses
    await user.save()
    console.log(user)
    res.status(200).json({ success: true })
  } catch (err) {
    res.json({ success: false, err })
  }
})

app.post('/api/bet/update', async (req, res) => {
  const content = req.body.content
  const winner = req.body.winner
  const loser = req.body.loser
  // const members = req.body.members
  if (!content) {
    return res.status(400).json({ success: false, message: '내기 내용을 입력하세요.' })
  }
  if (!winner || !loser) {
    return res.status(400).json({ success: false, message: '승자와 패자를 입력하세요.' })
  }

  try {
    const bet = await Bet.findOne({ content: content })
    if (!bet) {
      return res.status(404).json({ success: false, message: '등록된 내기가 없습니다.' })
    }
    const winnerUser = await User.findOne({ name:winner })
    const loserUsers = await User.find({ name: { $in: loser.map(l => l.name) } })

    bet.winner = { id: winnerUser.id, name: winnerUser.name }
    bet.loser = loserUsers.map(loserUser => ({ id: loserUser.id, name: loserUser.name }))
    // if(members) {
    //   const membersIn = await User.find({name: {$in: members}})
    //   const memberIds = membersIn.map(member => ({ id: member.id, name: member.name }))
    //   bet.members = memberIds 
    // }
    await bet.save()
    console.log(bet)
    res.status(200).json({ success: true })
  } catch (err) {
    res.json({ success: false, err })
  }
})

app.get("/api/top10", async (req, res) => {
  try {
    const topPlayersRaw = await User.aggregate([
      { $sort: { score: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,    
          name: 1,
          score: 1,
          profile_img: 1,
        }
      }
    ]);

    const topPlayers = topPlayersRaw.map((player, index) => ({
      ...player,
      rank: index+1,
    }));

    res.status(200).json({ top10: topPlayers });
  } catch (err) {
    console.error('Error fetching top players:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
})

app.post("/api/user/friendRankings", async function (req, res) {
  const auth = req.headers.authorization
  const id = req.body.id
  const token = auth ? auth.split(' ')[1] : null
  if(!token){
    return res.status(401).json({ code : -401, msg: "access token missing" })
  }
  const uri = api_host + "/v1/api/talk/friends"  // 사용자 친구 가져오기 API 주소
  const param = {}  // 사용자 정보 요청 시 파라미터는 필요 없음
  const header = {
    "content-type": "application/x-www-form-urlencoded",  // 요청 헤더 Content-Type 지정
    Authorization: "Bearer " + token,  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("GET", uri, param, header)  // 카카오 API에 요청 전송
  console.log(rtn)
  console.log(rtn.elements)

  if (!rtn || !Array.isArray(rtn.elements)) {
    console.error('카카오 API 응답이 올바르지 않습니다:', rtn);
    return res.status(500).json({ success: false, message: '카카오 API 응답 오류', data: rtn });
  }


  const friends = rtn.elements.map(friend => String(friend.id))

  const friendsIn = await User.find({id: {$in: friends}})
  const me = await User.findOne({id: id})
  if (me) {
    friendsIn.push(me)
  }
  console.log(`pushed me:${friendsIn}`)

  const rankedUsers = friendsIn
    .sort((a, b) => b.score - a.score)
    .map((user, index) => ({
      rank: index + 1,
      name: user.name,
      score: user.score,
      profile_img: user.profile_img  
    }));
  
  return res.status(200).json({
    success: true,
    count: rankedUsers.length,
    rankings: rankedUsers
  })
})

app.post('/api/user/bet/ongoing', async (req, res) => {
  const id = req.body.id
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID를 입력하세요.' })
  }

  const now = new Date()
  try {
    const bets = await Bet.find({
      // 'members.id': id,
      start: { $lte: now },
      end: { $gte: now },
    })
    console.log(bets)
    const formattedBets = bets.map((bet, index) => ({
      id: index + 1, 
      status: 'ongoing',
      name: bet.title,
      date: bet.start.toISOString().split('T')[0],
      members: bet.members.map(member => (member.name)),
      price_url: bet.price,
      price_name: bet.price_name,
      content: bet.content,
      start: bet.start,
      end: bet.end,
    }))
    res.json({success: true, ongoingbets: formattedBets})
  } catch (err) {
    res.status(500).json({ success: false, error : `server error, ${err.message}`})
  }
})

app.post('/api/user/bet/ended', async (req, res) => {
  const id = req.body.id
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID를 입력하세요.' })
  }

  const now = new Date()
  try {
    const bets = await Bet.find({
      // 'members.id': id,
      end: { $lte: now },
    })
    console.log(bets)
    const formattedBets = bets.map((bet, index) => {
      const winnerId = bet.winner?.id; // optional chaining
      const isWinner = winnerId === id;
      let userStatus = 'over';
      if(winnerId === null) {
        userStatus = 'over';
      }
      else {
        userStatus = isWinner ? 'win' : 'lose';
      }

      return {
        id: index + 1,
        status: userStatus,
        name: bet.title,
        date: bet.start.toISOString().split('T')[0],
        members: bet.members.map((m) => m.name),
        price_url: bet.price,
        price_name: bet.price_name,
        content: bet.content,
        start: bet.start,
        end: bet.end,
        winner: bet.winner,
        loser: bet.loser,
      };
    });
    res.json({success: true, bets: formattedBets})
  } catch (err) {
    res.status(500).json({ success: false, error : `server error, ${err.message}`})
  }
})

app.post('/api/user/getLuck', async (req, res) => {
    const birthday = req.body.birth
    var fullQuestion = "내 생일은 " + birthday + "이야. 내 오늘 내기는 잘 풀릴지 운세를 알려줘. 재물운도 함께 알려줘."
    try {
        const answer = await askGemini(fullQuestion);
        res.json({answer : answer})
    } catch (err) {
        res.json({error : err})
    }
})

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
