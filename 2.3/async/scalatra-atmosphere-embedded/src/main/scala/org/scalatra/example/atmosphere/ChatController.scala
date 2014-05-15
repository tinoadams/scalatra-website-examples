package org.scalatra.example.atmosphere

// Default imports from a stock Scalatra g8 code generator:
import org.scalatra._
import scalate.ScalateSupport
import org.scalatra.atmosphere._
import org.scalatra.servlet.AsyncSupport
import org.scalatra.json.{ JValueResult, JacksonJsonSupport }
import org.json4s._
import JsonDSL._
import java.util.Date
import java.text.SimpleDateFormat
import org.fusesource.scalate.Template
import scala.concurrent._
import ExecutionContext.Implicits.global
import _root_.akka.actor.Props
import _root_.akka.actor.Actor
import _root_.akka.actor.ActorRef
import java.nio.file.Paths
import java.nio.file.StandardWatchEventKinds
import scala.collection.JavaConversions._
import java.io.RandomAccessFile
import java.net.URI

class ChatController extends ScalatraServlet
  with ScalateSupport with JValueResult
  with JacksonJsonSupport with SessionSupport
  with AtmosphereSupport {

  implicit protected val jsonFormats: Formats = DefaultFormats

  get("/") {
    contentType = "text/html"
    ssp("/index")
  }

  atmosphere("/the-chat") {
    new AtmosphereClient {
      var fileHandle: Option[LineFile] = None

      def closeFile = fileHandle.foreach(_.close)

      def addError(json: JValue, msg: String): JValue = json merge (("errors" -> List(msg)): JValue)

      def receive: AtmoReceive = {
        case Connected =>
          println("Client %s is connected" format uuid)
          broadcast(("author" -> "Someone") ~ ("message" -> "joined the room") ~ ("time" -> (new Date().getTime.toString)), Everyone)

        case Disconnected(ClientDisconnected, _) =>
          closeFile
          broadcast(("author" -> "Someone") ~ ("message" -> "has left the room") ~ ("time" -> (new Date().getTime.toString)), Everyone)

        case Disconnected(ServerDisconnected, _) =>
          closeFile
          println("Server disconnected the client %s" format uuid)

        case _: TextMessage =>
          send(("author" -> "system") ~ ("message" -> "Only json is allowed") ~ ("time" -> (new Date().getTime.toString)))

        case JsonMessage(json) =>
          println(json)

          val JInt(commandId) = json \ "id"
          val JString(command) = json \ "command"

          try {
            command match {
              case "open_file" =>
                val JString(filename) = json \ "filename"
//                val baseDir = "file:/Volumes/Data/workspaces/scala/scalatra-website-examples/2.3/async/scalatra-atmosphere-embedded/target/scala-2.10/test-classes/org/scalatra/example/atmosphere/"
                val baseDir = "file:/C:/projects/scalatra-website-examples/2.3/async/scalatra-atmosphere-embedded/target/scala-2.10/test-classes/org/scalatra/example/atmosphere/"
                val uri = URI.create(baseDir + filename)
                fileHandle = Some(new LineFile(uri))
                send(json)

              case "read_file" =>
                val JInt(start) = json \ "start"
                val JInt(end) = json \ "end"
                if (fileHandle.isEmpty)
                  send(addError(json, "Test"))
                else
                  fileHandle.foreach { file =>
                    val me = Me
                    file.readLines(Window(start.toLong, end.toLong)).map { readbuffer =>
                      val result = json merge (
                        ("lines" -> readbuffer.buffer.toList)
                        ~ ("actual_start" -> readbuffer.window.start)
                        ~ ("actual_end" -> readbuffer.window.end)
                      )
                      broadcast(result, to = me)
                    }
                  }
            }
          }
          catch {
            case e: Throwable => send(addError(json, e.getMessage()))
          }
      }
    }
  }

  error {
    case t: Throwable => t.printStackTrace()
  }

  notFound {
    // remove content type in case it was set through an action
    contentType = null
    // Try to render a ScalateTemplate if no route matched
    findTemplate(requestPath) map { path =>
      contentType = "text/html"
      layoutTemplate(path)
    } orElse serveStaticResource() getOrElse resourceNotFound()
  }
}
