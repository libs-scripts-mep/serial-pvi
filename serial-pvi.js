import Log from "../script-loader/utils-script.js"
import FWLink from "../daq-fwlink/FWLink.js"

export class SerialPVI {
   constructor(baud = 9600, parity = 0) {
      this.BAUD = baud
      this.PARITY = parity
      this.PORT = null
      /** Configurações estéticas para log */
      this.Log = {
         /** Cor que será apresentadas as requisições no console */
         req: Log.Colors.Blue.CornflowerBlue,
         /** Cor que será apresentadas as respostas no console */
         res: Log.Colors.Purple.Orchid,
         /** Cor que será apresentadas os erros no console */
         error: Log.Colors.Red.Crimson
      }
   }

   setPort(port) { this.PORT = port }
   getPort() { return this.PORT }
   isOpen(port = this.PORT) { return FWLink.runInstruction("serial.isopen", ['"' + port + '"']) == 1 }
   close() { return FWLink.runInstruction("serial.close", ['"' + this.PORT + '"']) == 1 }
   open() { return FWLink.runInstruction("serial.open", ['"' + this.PORT + '"', '"' + this.BAUD + '"', '"' + this.PARITY + '"']) == 1 }

   async ReadData(timeOut = 0) {
      return new Promise((resolve) => {
         setTimeout(() => {
            const response = FWLink.runInstructionS("serial.readbytedata", [this.PORT])
            Log.console(`${this.PORT} <= ${response}`, this.Log.res)
            resolve(response)
         }, timeOut)
      })
   }

   async SendBytes(data) {
      Log.console(`${this.PORT} <= ${data}`, this.Log.req)
      return FWLink.runInstructionS("serial.sendbyte", [this.PORT, data]) == 1
   }

   /**
    * 
    * @param {object} reqInfo
    * @returns 
    * 
    * # Exemplos
    * 
    * ```js
    * const reqInfo = {
    * request: String
    * regex: RegExp
    * readTimeout: Number //Opcional
    * tryNumber: Number //Opcional
    * maxTries: Number //Opcional
    * }
    * const serial = new SerialReqMenager(9600)
    * const result = await serialInstance.portDiscover(reqInfo)
    * ```
    * ## Result
    * 
    * ```js
    * {success: Boolean, port: String}
    * ```
    */
   async portDiscover(reqInfo) {

      const portList = SerialPVIUtil.getPortList()

      if (portList.length > 0 && portList[0] != '') {

         for (const port of portList) {

            this.setPort(port)
            reqInfo.tryNumber = 1

            if (this.open()) {

               const result = await this.WatchForResponse(reqInfo)
               if (result.success) {
                  return { success: true, port: this.getPort() }
               } else {
                  this.close()
               }

            } else {
               Log.console(`${port} - Impossivel abrir porta`, this.Log.error)
            }
         }

         this.setPort(null)
         return { success: false, port: this.getPort() }

      } else {
         this.setPort(null)
         return { success: false, port: this.getPort() }
      }
   }

   /**
    * 
    * @param {object} reqInfo { request: string, regex: RegExp, readTimeout: number, maxTries: number, tryNumber: number }
    * @returns 
    */
   async reqResMatchBytes(reqInfo) {
      const { regex } = reqInfo
      const { request } = reqInfo
      const { maxTries } = reqInfo
      const { tryNumber } = reqInfo
      const { readTimeout } = reqInfo

      try {
         this.SendBytes(request)
         let response = await this.ReadData(readTimeout)
         let match = response.match(regex)

         if (match) {
            return { success: true, response: match }
         } else if (tryNumber < maxTries) {
            reqInfo.tryNumber++
            return this.reqResMatchBytes(reqInfo)
         } else {
            return { success: false, response: null }
         }

      } catch (error) {
         console.error(error)
         return { success: false, response: null }
      }
   }
}

/**
 * 
 * @param {number} baud 
 * @param {number} parity 
 * @param {string} policy Politica de gerenciamento 
 * 
 * # Exemplos
 * 
 * ```js
 * const serial = new SerialReqManager(9600, 0)
 * const serial = new SerialReqManager(9600, 0, "Queue")
 * const serial = new SerialReqManager(115200, 0, "Stack")
 * ```
 */
export class SerialReqManager extends SerialPVI {
   constructor(baud, parity, policy = "Queue") {
      super(baud, parity)

      /**Permite pausar ou prosseguir com o processamento das requisições. ⚠️ Não impede a inserção de requisições no buffer.*/
      this.Processing = true
      /**Buffer de requisições: é possível monitorar todas as informações de cada requisição inserida. */
      this.ReqBuffer = []
      /**Buffer de respostas: é possível monitorar todas as informações de cada resposta inserida. ⚠️ Após atendida, a resposta é removida do buffer*/
      this.ResBuffer = []
      /**Determina a politica de gerenciamento das requisições entre `fila` ou `pilha`*/
      this.policyManagement = policy
      /**Determina o intervalo em que as requisições serão processadas. */
      this.ManagerInterval = 50

      this.Manager()
   }

   async Manager() {
      if (this.hasReqToSend() && this.Processing) {

         const nextReq = this.GetReq()
         const result = await this.reqResMatchBytes(nextReq)

         nextReq["matchResult"] = result.response
         nextReq["response"] = result.response == null ? "" : result.response[0]
         nextReq["success"] = result.success

         this.ResBuffer.push(nextReq)
         this.Manager()

      } else {
         setTimeout(() => {
            this.Manager()
         }, this.ManagerInterval)
      }
   }

   hasReqToSend() {
      return this.ReqBuffer.length > 0
   }

   /**
    * 
    * @returns requisicao: object
    * 
    * Baseado na politica de gerenciamento: "Stack", ou "Queue"
    */
   GetReq() {
      if (this.policyManagement == "Queue") {
         return this.ReqBuffer.splice(0, 1)[0]
      } else if (this.policyManagement == "Stack") {
         return this.ReqBuffer.pop()
      } else {
         console.warn(`Invalid policy management assignment!\n\n
         Allowed: 'Queue' and 'Stack'\n\n
         Assigned: ${this.policyManagement}`)
      }
   }

   /**
    * Insere requisicao no buffer de requisicoes
    * @param {object} reqInfo
    * @returns String
    */
   InsertReq(reqInfo) {
      reqInfo.readTimeout ||= 50
      reqInfo.tryNumber ||= 1
      reqInfo.maxTries ||= 3
      reqInfo["id"] = crypto.randomUUID()
      this.ReqBuffer.push(reqInfo)
      return reqInfo.id
   }

   /**
    * Busca e remove do buffer de respostas uma resposta baseado no UUID
    * @param {string} searchID 
    * @returns Object
    */
   SearchRes(searchID) {
      let obj = null

      this.ResBuffer.forEach((reqInfo, pos) => {
         const { id } = reqInfo
         if (id == searchID) {
            obj = reqInfo
            const removeRes = this.ResBuffer.splice(pos, 1)
         }
      })
      return obj
   }


   /**
    * Insere um objeto na pilha ou fila do gerenciador, e retorno um objeto com as adquiridas.
    * 
    * @param {Object} reqInfo 
    * @returns Object
    * 
    * # Exemplos
    * 
    * ```js
    * const reqInfo = {
    * request: String
    * regex: RegExp
    * readTimeout: Number //Opcional
    * tryNumber: Number //Opcional
    * maxTries: Number //Opcional
    * }
    * const serial = new SerialReqMenager(9600)
    * const result = await serial.WatchForResponse(reqInfo)
    * ```
    * ## Result
    * 
    * ```js
    * {id: String,
    *  maxTries: Number,
    *  readTimeout: Number,
    *  regex: RegExp,
    *  request: String,
    *  matchResult: Array,
    *  response: String,
    *  success: Boolean,
    *  tryNumber: Number}
    * ```
    */
   async WatchForResponse(reqInfo) {
      return new Promise((resolve) => {
         const id = this.InsertReq(reqInfo)

         const monitor = setInterval(() => {
            const obj = this.SearchRes(id)
            if (obj != null) {
               clearInterval(monitor)
               resolve(obj)
            }
         }, 50)
      })
   }

}

export class SerialPVIUtil {

   static getPortList() {
      return FWLink.runInstructionS("serial.getportscsv", []).split(";")
   }

   static async closeAllPorts() {
      return new Promise((resolve) => {

         let ports = SerialPVIUtil.getPortList()
         for (const port of ports) {
            console.log(`Fechando porta ${port}: `, FWLink.runInstruction("serial.close", ['"' + port + '"']) == 1)
         }
         resolve()
      })
   }

   static ConvertAscii(hex) {
      hex = hex.match(/[0-9A-Fa-f]*/g).filter(function (el) {
         return el != ""
      })
      hex = hex.map(function (item) {
         return parseInt(item, 16)
      })
      let bytes = new Uint8Array(hex)
      return new TextDecoder("ASCII", { NONSTANDARD_allowLegacyEncoding: true }).decode(bytes)
   }

   static BinaryToHex(bin) {
      try {
         let hex = Number(parseInt(bin, 2)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter binario para hexadecimal")
      }
   }

   static DecimalToHex(dec) {
      try {
         let hex = Number(parseInt(dec)).toString(16)
         hex = hex.toUpperCase()
         while (hex.length < 4) {
            hex = "0" + hex
         }
         return hex.substring(0, 2) + " " + hex.substring(2)
      } catch (error) {
         console.error("Erro ao converter decimal para hexadecimal")
      }
   }

   static HextoDecimal(hex) {
      try {
         return Number.parseInt("0x" + hex.replace(/[\t ]/g, ''))
      } catch (error) {
         console.error("Erro ao converter hexadecimal para decimal")
      }
   }

   static hex2bin(hex) {
      try {
         return (parseInt(hex, 16).toString(2)).padStart(8, '0')
      } catch (error) {
         console.error("Erro ao converter hexadecimal para binario")
      }
   }

   static {
      window.SerialPVIUtil = SerialPVIUtil
      console.log("SerialPVIUtil is ready!")
   }
}