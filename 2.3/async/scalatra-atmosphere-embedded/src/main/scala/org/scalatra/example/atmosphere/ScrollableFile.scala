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

class ScrollableFile(val filename: String, val charsetName: String = "UTF-8", val preferedBufferSize: Int = 20) {
  val lineSeperator = "\n"
  val charset = Charset.forName(charsetName)
  val stringDecoder = charset.newDecoder()
  stringDecoder.onMalformedInput(CodingErrorAction.REPLACE)
  stringDecoder.onUnmappableCharacter(CodingErrorAction.REPLACE)

  // size the buffer so we can try and always fit whole chars in it
  // eg. UTF-16 = 2 bytes should have a buffer size of 2, 4, 6...
  val charByte = (1 / stringDecoder.averageCharsPerByte).toInt
  val bufferSize = preferedBufferSize + (preferedBufferSize % charByte)
  val lineSeperatorByte = (charByte * lineSeperator.length())

  //  private val handle = new RandomAccessFile(filename, "r")
  private val channel = AsynchronousFileChannel.open(Paths.get(filename))
  private val bytes = ByteBuffer.allocate(bufferSize)
  private val chars = CharBuffer.allocate(bufferSize)

  private var cursor = 0L
  private var lineSeperatorFound = false
  case class Line(content: Option[String], cursor: Long)

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
  }

  private def read(start: Long): Future[Line] = {
    //    println("READ:" + start)
    def doRead(start: Long) = {
      //      println("DOREAD:" + start + " - " + (start + bytes.remaining()))
      val (future, handler) = nioHandler
      channel.read(bytes, start, null, handler)
      future.map { read =>
        if (read == -1) {
          Line(None, start)
        }
        else {
          bytes.flip() // prepare buffer for reading
          chars.clear() // empty chars
          // start new decoding sequence
          stringDecoder.reset()
          stringDecoder.decode(bytes, chars, true)
          stringDecoder.flush(chars)
          chars.flip() // prepare decoded chars for reading
          // progress our virtual file position by as many bytes as the decoder has read
          Line(Some(chars.toString), start + bytes.position())
        }
      }
    }

    // we assume that decodeBytes only returns the number of bytes that have been read to decode the string
    // eg. 19 bytes read but only 18 used to decode UTF-16 string
    bytes.clear

    if (start < 0) {
      // equivalent to EOF, if we are at least one buffer length away from the file start
      if ((start + bufferSize) <= 0)
        Future(Line(None, 0))
      // read from start of file
      else {
        val limit = (start + bufferSize).toInt
        //                println("LIMITING:" + limit)
        bytes.limit(limit)
        doRead(0)
      }
    }
    else {
      // clear potential left overs from last use
      // normal read from given start position
      doRead(start)
    }
  }

  def nioHandler: (Future[Integer], CompletionHandler[Integer, java.lang.Object]) = {
    val promise = Promise[Integer]()
    val handler = new CompletionHandler[Integer, java.lang.Object]() {
      override def completed(result: Integer, attachment: java.lang.Object): Unit = promise.success(result)
      override def failed(e: Throwable, attachment: java.lang.Object): Unit = promise.failure(e)
    }

    (promise.future, handler)
  }

  def close = channel.close()
}