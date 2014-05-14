package org.scalatra.example.atmosphere

import java.io.RandomAccessFile
import java.nio.MappedByteBuffer
import java.nio.channels.AsynchronousFileChannel
import java.nio.file._
import java.nio.charset._
import java.nio.channels.CompletionHandler
import scala.concurrent.Future
import scala.concurrent.Promise
import java.nio.ByteBuffer
import scala.concurrent.ExecutionContext.Implicits.global
import java.nio.CharBuffer
import java.net.URI
//import scala.collection.JavaConversions._

case class Window(start: Long, end: Long) {
  require(start >= 0, "Window start must not be negative")
  def size: Int = (end - start).toInt
  def bof: Boolean = this.start == 0
  def eof(that: Window): Boolean = this.end < that.end
}

case class ReadBuffer[A](buffer: A, window: Window)

class ScrollableFile(val fileUri: URI, val charsetName: String = "UTF-8", val preferedBufferSize: Int = 20) {
  private var cursor = 0L
  private var lineSeperatorFound = false

  /*
  def up(): Future[Option[String]] = {
    //    println("up:" + cursor)
    up(cursor).map { line =>
      cursor = line.cursor
      //      println("done up:" + cursor)
      line.content
    }
  }

  private def up(start: Long): Future[Line] = {
    val line = read(start - bufferSize)
    line.flatMap {
      case Line(Some(str), cursor) =>
        val eol = str.reverse.indexOf(lineSeperator)
        lineSeperatorFound = eol != -1
        if (eol == -1)
          // recursively search for either lineSeperator or BOF, whilst preserving what we've already found
          up(cursor - bufferSize).map {
            case Line(None, position) => Line(Some(str), position)
            case Line(Some(prepend), position) => Line(Some(prepend + str), position)
          }
        else {
          //          println("FOUND REVERSE:" + eol)
          //          println("FOUND:" + (str.length - eol))
          //          println(s"STR ($str)")
          val substr = str.substring(str.length - eol)
          // adjust our virtual file pointer backwards to where we found the lineSeperator (in bytes)
          val adjustBy = (charByte * substr.length()) + lineSeperatorByte
          Future(Line(Some(substr), cursor - adjustBy))
        }

      case _ => line
    }
  }

  def down(): Future[Option[String]] = {
    //    println("down:" + cursor)
    down(cursor).map { line =>
      cursor = line.cursor
      //      println("done down:" + cursor)
      line.content
    }
  }

  private def down(start: Long): Future[Line] = {
    val line = read(start + (if (lineSeperatorFound) lineSeperatorByte else 0))
    line.flatMap {
      case Line(Some(str), cursor) =>
        val eol = str.indexOf(lineSeperator)
        lineSeperatorFound = eol != -1
        if (eol == -1)
          // recursively search for either lineSeperator or EOF, whilst preserving what we've already found
          down(cursor).map {
            case Line(None, position) => Line(Some(str), position)
            case Line(Some(append), position) => Line(Some(str + append), position)
          }
        else {
          val substr = str.substring(0, eol)
          // adjust our virtual file pointer backwards to where we found the lineSeperator (in bytes)
          val adjustBy = (charByte * str.length()) - (charByte * substr.length())
          Future(Line(Some(substr), cursor - adjustBy))
        }

      case _ => line
    }
  }*/

}

class LineFile(val fileUri: URI, val charsetName: String = "UTF-8") {
  val lineSeperator = '\n'
  val charset = Charset.forName(charsetName)
  val stringDecoder = charset.newDecoder()
  stringDecoder.onMalformedInput(CodingErrorAction.REPLACE)
  stringDecoder.onUnmappableCharacter(CodingErrorAction.REPLACE)
  val stringEncoder = charset.newEncoder()
  stringEncoder.onMalformedInput(CodingErrorAction.REPLACE)
  stringEncoder.onUnmappableCharacter(CodingErrorAction.REPLACE)

  //  private val handle = new RandomAccessFile(filename, "r")
  private val channel = AsynchronousFileChannel.open(Paths.get(fileUri))

  def readLines(window: Window): Future[ReadBuffer[Array[String]]] = {
    readChars(window).flatMap { cbuf =>
      if (cbuf.buffer.limit == 0) {
        Future.successful(ReadBuffer(Array(), cbuf.window))
      }
      else {
        def indexOfLastLineSeperator: Int = {
          for (i <- cbuf.buffer.limit - 1 to 0 by -1)
            if (cbuf.buffer.get(i) == lineSeperator) return i
          return -1
        }

        val eof = cbuf.window.eof(window)
        val lastSep = if (eof) cbuf.buffer.limit else indexOfLastLineSeperator
        if (lastSep > -1) {
          if (!eof)
            cbuf.buffer.limit(lastSep + 1)
          val string = cbuf.buffer.toString
          // size the buffer so we can try and always fit whole chars in it
          // eg. UTF-16 = 2 bytes should have a buffer size of 2, 4, 6...
          stringEncoder.reset()
          val bbuf = stringEncoder.encode(cbuf.buffer)
          val bytes = bbuf.limit
          val adjustedWindow = cbuf.window.copy(end = cbuf.window.start + bytes)
          Future.successful(ReadBuffer(string.split(lineSeperator), adjustedWindow))
        }
        // looooong line and still haven't reached EOF
        else {
          val nextWindow = cbuf.window.copy(
            start = cbuf.window.end,
            end = cbuf.window.end + window.size
          )
          readLines(nextWindow).map { lbuf =>
            val string = cbuf.buffer.toString
            val adjustedWindow = cbuf.window.copy(
              end = lbuf.window.end
            )
            if (lbuf.buffer.length > 0)
              lbuf.buffer(0) = string + lbuf.buffer(0)
            ReadBuffer(lbuf.buffer, adjustedWindow)
          }
        }
      }
    }
  }

  private def readChars(window: Window): Future[ReadBuffer[CharBuffer]] = {
    readBytes(window).map { bbuf =>
      val chars = CharBuffer.allocate(window.size)
      if (bbuf.buffer.limit == 0) {
        chars.flip()
        ReadBuffer(chars, bbuf.window)
      }
      else {
        stringDecoder.reset()
        stringDecoder.decode(bbuf.buffer, chars, true)
        stringDecoder.flush(chars)
        chars.flip() // prepare decoded chars for reading
        // adjust the window end to as many bytes we were able to decode
        val adjustedWindow = bbuf.window.copy(end = bbuf.window.start + bbuf.buffer.position)
        ReadBuffer(chars, adjustedWindow)
      }
    }
  }

  private def readBytes(window: Window): Future[ReadBuffer[ByteBuffer]] = {
    val promise = Promise[Integer]()
    val future = promise.future
    val handler = new CompletionHandler[Integer, java.lang.Object]() {
      override def completed(result: Integer, attachment: java.lang.Object): Unit = promise.success(result)
      override def failed(e: Throwable, attachment: java.lang.Object): Unit = promise.failure(e)
    }

    val bytes = ByteBuffer.allocate(window.size)
    channel.read(bytes, window.start, null, handler)
    future.map { read =>
      bytes.flip() // prepare buffer for reading
      val eof = read != window.size
      val adjustedWindow = if (eof) window.copy(end = window.start + read) else window
      ReadBuffer(bytes, adjustedWindow)
    }
  }

  def close = channel.close()
}